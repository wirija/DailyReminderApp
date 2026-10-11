"""Environment-configured application settings for local development and Ubuntu Compose."""
import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent
def env_bool(name, default=False):
    return os.environ.get(name, str(default)).lower() in {'1', 'true', 'yes'}

DEBUG = env_bool('DJANGO_DEBUG', True)
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'local-development-only-change-before-deployment')
if not DEBUG and (len(SECRET_KEY) < 32 or any(marker in SECRET_KEY.lower() for marker in ('local-development', 'replace_', 'change_me', 'example'))):
    raise ImproperlyConfigured('Set a unique DJANGO_SECRET_KEY of at least 32 characters.')
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')
CSRF_TRUSTED_ORIGINS = [x for x in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if x]
INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'rest_framework', 'accounts', 'planner', 'workspace', 'integrations',
    'huey.contrib.djhuey', 'allauth', 'allauth.account', 'allauth.socialaccount',
    'allauth.socialaccount.providers.openid_connect',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware', 'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware',
    'allauth.account.middleware.AccountMiddleware', 'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware', 'accounts.middleware.PrivateResponseMiddleware',
]
ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [BASE_DIR / 'templates'], 'APP_DIRS': True,
    'OPTIONS': {'context_processors': ['django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
DATABASES = {'default': dj_database_url.config(default='sqlite:///' + str(BASE_DIR / 'db.sqlite3'), conn_max_age=60)}
if DATABASES['default']['ENGINE'].endswith('sqlite3'):
    DATABASES['default']['OPTIONS'] = {'timeout': 20}
AUTH_USER_MODEL = 'accounts.User'
AUTHENTICATION_BACKENDS = ['django.contrib.auth.backends.ModelBackend', 'allauth.account.auth_backends.AuthenticationBackend']
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE = 'en-sg'
TIME_ZONE = 'Asia/Singapore'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_ROOT = Path(os.environ.get('MEDIA_ROOT', str(BASE_DIR / 'media')))
MEDIA_URL = '/private-media/'  # Deliberately no public route. Files require authenticated views.
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/app/'
LOGOUT_REDIRECT_URL = '/accounts/login/'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = env_bool('DJANGO_SECURE_SSL_REDIRECT', not DEBUG)
SECURE_HSTS_SECONDS = 3600 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
if env_bool('DJANGO_BEHIND_PROXY'):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.UserRateThrottle', 'rest_framework.throttling.AnonRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {'user': '600/min', 'anon': '30/min'},
}
ACCOUNT_ADAPTER = 'accounts.adapters.ClosedAccountAdapter'
SOCIALACCOUNT_ADAPTER = 'accounts.adapters.EntraAdapter'
ACCOUNT_EMAIL_VERIFICATION = 'none'
ACCOUNT_LOGIN_METHODS = {'username'}
ACCOUNT_SIGNUP_FIELDS = ['username*', 'password1*', 'password2*']
SOCIALACCOUNT_AUTO_SIGNUP = False
SOCIALACCOUNT_EMAIL_AUTHENTICATION = False
ENTRA_ENABLED = env_bool('ENTRA_ENABLED')
ENTRA_TENANT_ID = os.environ.get('ENTRA_TENANT_ID', '')
ENTRA_ALLOWED_OBJECT_IDS = {x.strip() for x in os.environ.get('ENTRA_ALLOWED_OBJECT_IDS', '').split(',') if x.strip()}
ENTRA_LINK_USERNAME = os.environ.get('ENTRA_LINK_USERNAME', '')
SOCIALACCOUNT_PROVIDERS = {}
if ENTRA_ENABLED:
    import uuid
    try:
        uuid.UUID(ENTRA_TENANT_ID)
        for oid in ENTRA_ALLOWED_OBJECT_IDS:
            uuid.UUID(oid)
    except ValueError as error:
        raise ImproperlyConfigured('Entra tenant and allowed object IDs must be UUIDs.') from error
    if not ENTRA_ALLOWED_OBJECT_IDS or not os.environ.get('ENTRA_CLIENT_ID') or not os.environ.get('ENTRA_CLIENT_SECRET'):
        raise ImproperlyConfigured('Entra requires client ID, client secret, tenant ID and explicitly allowed object IDs.')
    if ENTRA_LINK_USERNAME and len(ENTRA_ALLOWED_OBJECT_IDS) != 1:
        raise ImproperlyConfigured('Linking an existing local user requires exactly one allowed Entra object ID.')
    SOCIALACCOUNT_PROVIDERS = {'openid_connect': {'APPS': [{
        'provider_id': 'entra', 'name': 'Microsoft Entra ID',
        'client_id': os.environ['ENTRA_CLIENT_ID'], 'secret': os.environ['ENTRA_CLIENT_SECRET'],
        'settings': {'server_url': f'https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0',
                     'token_auth_method': 'client_secret_post', 'oauth_pkce_enabled': True, 'fetch_userinfo': False},
    }]}}
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen3:8b')
CLOUD_AI_BASE_URL = os.environ.get('CLOUD_AI_BASE_URL', '')
CLOUD_AI_MODEL = os.environ.get('CLOUD_AI_MODEL', '')
CLOUD_AI_API_KEY = os.environ.get('CLOUD_AI_API_KEY', '')
CONNECTOR_ENCRYPTION_KEY = os.environ.get('CONNECTOR_ENCRYPTION_KEY', '')
if CONNECTOR_ENCRYPTION_KEY:
    from cryptography.fernet import Fernet
    try:
        Fernet(CONNECTOR_ENCRYPTION_KEY)
    except (ValueError, TypeError) as error:
        raise ImproperlyConfigured('CONNECTOR_ENCRYPTION_KEY must be a valid Fernet key.') from error
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.db.DatabaseCache', 'LOCATION': 'planner_cache'}} if env_bool('DJANGO_DATABASE_CACHE', not DEBUG) else {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
ACCOUNT_RATE_LIMITS = {'login': '30/m/ip', 'login_failed': '5/5m/key,20/5m/ip'}
POSTGRES_QUEUE = DATABASES['default']['ENGINE'].endswith('postgresql')
HUEY = {
    'huey_class': 'huey.PostgresHuey' if POSTGRES_QUEUE else 'huey.SqliteHuey',
    'name': 'daily-planner', 'immediate': env_bool('HUEY_IMMEDIATE', False),
    'connection': {'dsn': os.environ['DATABASE_URL']} if POSTGRES_QUEUE else {'filename': str(BASE_DIR / 'huey.db')},
    'consumer': {'workers': 2, 'worker_type': 'thread'},
}
if POSTGRES_QUEUE:
    HUEY['create_tables'] = False
