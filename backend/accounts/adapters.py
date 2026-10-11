from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.db import transaction
from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from .models import ExternalIdentity

class ClosedAccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        return False

class EntraAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin):
        return False

    def pre_social_login(self, request, sociallogin):
        # Use the validated ID token, never mutable email or userinfo, for linking.
        data = sociallogin.account.extra_data.get('id_token', {})
        # allauth handles the authorization-code exchange and ID-token validation.
        tenant, object_id = str(data.get('tid', '')), str(data.get('oid', ''))
        if not settings.ENTRA_ENABLED or tenant != settings.ENTRA_TENANT_ID or object_id not in settings.ENTRA_ALLOWED_OBJECT_IDS:
            raise PermissionDenied('This Microsoft account is not assigned to this application.')
        with transaction.atomic():
            identity = ExternalIdentity.objects.select_related('user').filter(tenant_id=tenant, object_id=object_id).first()
            if identity:
                user = identity.user
            elif settings.ENTRA_LINK_USERNAME:
                user = get_user_model().objects.select_for_update().filter(username=settings.ENTRA_LINK_USERNAME).first()
                if not user:
                    raise PermissionDenied('The configured local account does not exist.')
                ExternalIdentity.objects.create(user=user, tenant_id=tenant, object_id=object_id)
            else:
                raise PermissionDenied('Ask the application administrator to link this identity to your account.')
            if not user.is_active:
                raise PermissionDenied('This application account is inactive.')
            if sociallogin.is_existing and sociallogin.user.pk != user.pk:
                raise PermissionDenied('The Microsoft identity is already linked to another account.')
            if not sociallogin.is_existing:
                sociallogin.connect(request, user)
