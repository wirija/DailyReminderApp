"""Independent authentication regression checks; no live Entra tenant is contacted."""
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import PermissionDenied
from django.test import Client, RequestFactory, TestCase, override_settings

from accounts.adapters import ClosedAccountAdapter, EntraAdapter
from accounts.models import ExternalIdentity


class AuthenticationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(username="owner", password="Testing-a-long-passphrase-942")

    def test_local_login_and_csrf_protect_mutations(self):
        client = Client(enforce_csrf_checks=True)
        page = client.get("/accounts/login/")
        self.assertEqual(page.status_code, 200)
        token = client.cookies["csrftoken"].value
        response = client.post("/accounts/login/", {"login": "owner", "password": "Testing-a-long-passphrase-942"})
        self.assertEqual(response.status_code, 403)
        response = client.post("/accounts/login/", {"login": "owner", "password": "Testing-a-long-passphrase-942", "csrfmiddlewaretoken": token})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "/app/")
        response = client.get("/api/auth/session/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["username"], "owner")
        response = client.post("/api/clients/", data={"name": "Client"}, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        response = client.post("/api/clients/", data={"name": "Client"}, content_type="application/json", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        response = client.get("/api/workspace/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(client.get("/accounts/logout/").status_code, 405)
        self.assertEqual(client.post("/accounts/logout/").status_code, 403)
        response = client.post("/accounts/logout/", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(client.get("/api/auth/session/").status_code, 401)

    def test_accounts_are_not_publicly_registered_and_api_requires_login(self):
        self.assertFalse(ClosedAccountAdapter().is_open_for_signup(RequestFactory().get("/")))
        response = self.client.post("/accounts/signup/", {"username": "uninvited", "password1": "Other-passphrase-981", "password2": "Other-passphrase-981"})
        self.assertNotIn(response.status_code, [201, 302])
        self.assertFalse(get_user_model().objects.filter(username="uninvited").exists())
        self.assertIn(self.client.get("/api/projects/").status_code, [401, 403])
        self.assertEqual(self.client.get("/api/auth/session/").status_code, 401)

    def test_successful_login_refuses_external_redirect(self):
        response = self.client.post("/accounts/login/", {"login": "owner", "password": "Testing-a-long-passphrase-942", "next": "https://hostile.example/"})
        self.assertEqual(response.status_code, 302)
        self.assertFalse(response.url.startswith("https://hostile.example"))

    @override_settings(ACCOUNT_RATE_LIMITS={"login_failed": "2/m/ip"})
    def test_repeated_bad_password_attempts_are_limited(self):
        responses = [self.client.post("/accounts/login/", {"login": "owner", "password": "wrong-password"}) for _ in range(4)]
        self.assertContains(responses[-1], "Too many failed login attempts")
        response = self.client.post("/accounts/login/", {"login": "owner", "password": "Testing-a-long-passphrase-942"})
        self.assertContains(response, "Too many failed login attempts")
        self.assertEqual(self.client.get("/api/auth/session/").status_code, 401)

    def test_public_app_assets_do_not_expose_private_paths(self):
        response = self.client.get("/app/manifest.webmanifest")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/manifest+json")
        self.assertEqual(self.client.get("/app/../../backend/config/settings.py").status_code, 404)
        self.assertEqual(self.client.get("/private-media/example.docx").status_code, 404)
        response = self.client.get("/api/auth/session/")
        self.assertIn("no-store", response["Cache-Control"])


class EntraIdentityTests(TestCase):
    def setUp(self):
        self.tenant, self.object_id = str(uuid4()), str(uuid4())
        self.user = get_user_model().objects.create_user(username="owner", password="Testing-a-long-passphrase-942")
        self.request = RequestFactory().get("/accounts/oidc/entra/login/callback/")
        self.request.user = self.user

    def social(self, claims=None, userinfo=None, existing=False, user=None):
        return SimpleNamespace(account=SimpleNamespace(extra_data={"id_token": claims or {}, "userinfo": userinfo or {}}), is_existing=existing, user=user or self.user, connect=Mock())

    def configured(self):
        return override_settings(ENTRA_ENABLED=True, ENTRA_TENANT_ID=self.tenant, ENTRA_ALLOWED_OBJECT_IDS={self.object_id}, ENTRA_LINK_USERNAME="owner")

    def test_only_validated_token_tenant_and_object_claims_can_link(self):
        social = self.social({"tid": self.tenant, "oid": self.object_id}, {"email": "unrelated@example.com"})
        with self.configured():
            EntraAdapter().pre_social_login(self.request, social)
        identity = ExternalIdentity.objects.get()
        self.assertEqual(identity.user, self.user)
        self.assertEqual(str(identity.object_id), self.object_id)
        social.connect.assert_called_once_with(self.request, self.user)

    def test_userinfo_cannot_override_wrong_token_tenant_or_object(self):
        for claims in [{"tid": str(uuid4()), "oid": self.object_id}, {"tid": self.tenant, "oid": str(uuid4())}, {}]:
            social = self.social(claims, {"tid": self.tenant, "oid": self.object_id, "email": self.user.email})
            with self.configured(), self.assertRaises(PermissionDenied):
                EntraAdapter().pre_social_login(self.request, social)
            social.connect.assert_not_called()
        self.assertEqual(ExternalIdentity.objects.count(), 0)

    def test_identity_remains_linked_when_email_changes(self):
        ExternalIdentity.objects.create(user=self.user, tenant_id=self.tenant, object_id=self.object_id)
        social = self.social({"tid": self.tenant, "oid": self.object_id, "email": "changed@example.com"})
        with self.configured(), override_settings(ENTRA_LINK_USERNAME=""):
            EntraAdapter().pre_social_login(self.request, social)
        self.assertEqual(ExternalIdentity.objects.count(), 1)
        social.connect.assert_called_once_with(self.request, self.user)

    def test_existing_linked_social_account_is_not_reconnected(self):
        ExternalIdentity.objects.create(user=self.user, tenant_id=self.tenant, object_id=self.object_id)
        social = self.social({"tid": self.tenant, "oid": self.object_id}, existing=True)
        with self.configured():
            EntraAdapter().pre_social_login(self.request, social)
        social.connect.assert_not_called()
        self.assertEqual(ExternalIdentity.objects.count(), 1)

    def test_inactive_unlinked_and_mismatched_accounts_are_rejected(self):
        self.user.is_active = False
        self.user.save()
        social = self.social({"tid": self.tenant, "oid": self.object_id})
        with self.configured(), self.assertRaises(PermissionDenied):
            EntraAdapter().pre_social_login(self.request, social)
        self.assertEqual(ExternalIdentity.objects.count(), 0)
        self.user.is_active = True
        self.user.save()
        with self.configured(), override_settings(ENTRA_LINK_USERNAME=""), self.assertRaises(PermissionDenied):
            EntraAdapter().pre_social_login(self.request, social)
        other = get_user_model().objects.create_user(username="other")
        social = self.social({"tid": self.tenant, "oid": self.object_id}, existing=True, user=other)
        with self.configured(), self.assertRaises(PermissionDenied):
            EntraAdapter().pre_social_login(self.request, social)
        self.assertEqual(ExternalIdentity.objects.count(), 0)

class UserAdministrationTests(TestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_superuser(username='operator',password='Test-password-9421')
        self.client.force_login(self.admin)

    def test_create_user_and_private_workspace(self):
        from planner.models import Project
        from datetime import date
        Project.objects.create(workspace=self.admin,name='Private project',start_date=date(2026,10,1),end_date=date(2026,11,1))
        response=self.client.get('/administration/users/')
        self.assertEqual(response.status_code,200)
        self.assertIn('no-store',response['Cache-Control'])
        response=self.client.post('/administration/users/',{'action':'create','username':'colleague','password1':'Unique-password-81493','password2':'Unique-password-81493'})
        self.assertEqual(response.status_code,302)
        account=get_user_model().objects.get(username='colleague')
        self.assertFalse(account.is_superuser)
        self.client.force_login(account)
        self.assertEqual(self.client.get('/administration/users/').status_code,403)
        self.assertEqual(self.client.get('/api/workspace/').json()['projects'],[])

    def test_delete_disables_login_preserves_history_and_protects_current_user(self):
        from planner.models import Project
        from datetime import date
        account=get_user_model().objects.create_user(username='retiring',password='Unique-password-81493')
        project=Project.objects.create(workspace=account,name='Retained project',start_date=date(2026,10,1),end_date=date(2026,11,1))
        logged_in=Client();logged_in.force_login(account)
        response=self.client.post('/administration/users/',{'action':'delete','user_id':str(account.pk),'confirmation':'wrong'})
        account.refresh_from_db();self.assertTrue(account.is_active)
        response=self.client.post('/administration/users/',{'action':'delete','user_id':str(account.pk),'confirmation':'retiring'})
        self.assertEqual(response.status_code,302)
        account.refresh_from_db();self.assertFalse(account.is_active);self.assertIsNotNone(account.deleted_at)
        self.assertFalse(account.has_usable_password());self.assertTrue(Project.objects.filter(pk=project.pk).exists())
        self.assertEqual(logged_in.get('/api/workspace/').status_code,403)
        response=self.client.post('/administration/users/',{'action':'delete','user_id':str(self.admin.pk),'confirmation':'operator'})
        self.admin.refresh_from_db();self.assertTrue(self.admin.is_active)
        self.assertContains(response,'cannot delete')

    def test_admin_forms_require_csrf(self):
        guarded=Client(enforce_csrf_checks=True);guarded.force_login(self.admin)
        self.assertEqual(guarded.post('/administration/users/',{'action':'create'}).status_code,403)
