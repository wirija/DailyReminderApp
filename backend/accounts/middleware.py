class PrivateResponseMiddleware:
    """Only shipped PWA assets may be cached; never records, credentials or files."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(('/api/', '/accounts/', '/admin/', '/administration/')):
            response['Cache-Control'] = 'private, no-store'
        return response
