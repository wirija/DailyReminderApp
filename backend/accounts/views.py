import mimetypes
import sys
from functools import lru_cache
from pathlib import Path
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LogoutView
from allauth.account.views import LoginView
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

class PlannerLoginView(LoginView):
    template_name = 'registration/login.html'
    redirect_authenticated_user = True
    def get_context_data(self, **kwargs):
        return {**super().get_context_data(**kwargs), 'entra_enabled': settings.ENTRA_ENABLED}

class PlannerLogoutView(LogoutView):
    pass

@require_GET
@never_cache
def session(request):
    token = get_token(request)
    if not request.user.is_authenticated:
        return JsonResponse({'detail': 'Sign in to continue.', 'login_url': settings.LOGIN_URL, 'csrfToken': token}, status=401)
    return JsonResponse({'user': {'id': str(request.user.pk), 'username': request.user.username,
        'display_name': request.user.get_full_name() or request.user.username, 'is_staff': request.user.is_staff, 'is_superuser': request.user.is_superuser},
        'csrfToken': token, 'entraEnabled': settings.ENTRA_ENABLED})

@require_GET
def health(request):
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        return JsonResponse({'status': 'ok'})
    except Exception:
        return JsonResponse({'status': 'unavailable'}, status=503)

@lru_cache(maxsize=1)
def allowed_assets():
    sys.path.insert(0, str(settings.REPO_DIR / 'scripts'))
    from build_pwa import shell_files
    return frozenset(shell_files() + ['service-worker.js'])

@require_GET
def app_asset(request, asset=''):
    asset = asset or 'mockup.html'
    if asset not in allowed_assets():
        raise Http404
    path = (settings.REPO_DIR / 'docs' / asset).resolve()
    if not path.is_relative_to((settings.REPO_DIR / 'docs').resolve()):
        raise Http404
    if asset == 'mockup.html':
        # Public shell contains no user data. All data/files are authenticated API requests.
        html = path.read_text().replace('<title>', '<script>window.PLANNER_SERVER=true;</script><title>', 1)
        response = HttpResponse(html, content_type='text/html; charset=utf-8')
    else:
        mime = {'webmanifest': 'application/manifest+json', 'js': 'text/javascript'}.get(path.suffix[1:], mimetypes.guess_type(path.name)[0])
        response = FileResponse(path.open('rb'), content_type=mime or 'application/octet-stream')
    response['Cache-Control'] = 'no-cache'
    if asset == 'service-worker.js':
        response['Service-Worker-Allowed'] = '/app/'
    return response

@login_required
def user_administration(request):
    from django.contrib.auth import get_user_model
    from django.contrib.auth.forms import UserCreationForm
    from django import forms
    from django.db import transaction
    from django.db.models import Count
    from django.shortcuts import render, redirect
    from django.http import HttpResponseForbidden
    from django.utils import timezone
    from django.contrib import messages
    User = get_user_model()
    if not request.user.is_superuser:
        return HttpResponseForbidden('Only administrators can manage sign-in accounts.')
    class CreateUserForm(UserCreationForm):
        administrator = forms.BooleanField(required=False, label='Administrator access', help_text='Allows managing other sign-in accounts. Project records remain private to their owner.')
        class Meta(UserCreationForm.Meta):
            model = User
            fields = ('username', 'first_name', 'last_name', 'email')
    form = CreateUserForm(request.POST if request.method == 'POST' and request.POST.get('action') == 'create' else None)
    error = ''
    if request.method == 'POST':
        with transaction.atomic():
            locked_users = list(User.objects.select_for_update().order_by('pk'))
            actor = next(account for account in locked_users if account.pk == request.user.pk)
            if not actor.is_active or not actor.is_superuser:
                return HttpResponseForbidden('Administrator access is required.')
            if request.POST.get('action') == 'create' and form.is_valid():
                account = form.save(commit=False)
                account.is_superuser = form.cleaned_data['administrator']
                account.is_staff = account.is_superuser
                account.save()
                messages.success(request, 'User created. They can sign in to their own empty workspace.')
                return redirect('user-administration')
            if request.POST.get('action') == 'delete':
                try:
                    account = User.objects.select_for_update().get(pk=request.POST.get('user_id'), deleted_at__isnull=True)
                except (User.DoesNotExist, forms.ValidationError, ValueError):
                    error = 'This account is no longer available. Refresh the page.'
                else:
                    if account.pk == actor.pk:
                        error = 'You cannot delete the account you are signed in with.'
                    elif request.POST.get('confirmation') != account.username:
                        error = 'Type the exact username to confirm deletion.'
                    else:
                        account.is_active = account.is_staff = account.is_superuser = False
                        account.deleted_at = timezone.now()
                        account.set_unusable_password()
                        account.save()
                        messages.success(request, 'Account deleted from the sign-in directory. Its project records and audit history are retained; sign-in is disabled.')
                        return redirect('user-administration')
    users = User.objects.filter(deleted_at__isnull=True).annotate(project_count=Count('project')).order_by('username')
    return render(request, 'accounts/user_administration.html', {'users': users, 'form': form, 'error': error})
