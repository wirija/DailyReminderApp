from django.db import transaction, IntegrityError
from decimal import DecimalException
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import WorkspaceState


@api_view(['GET'])
def revision(request):
    state, _ = WorkspaceState.objects.get_or_create(user=request.user)
    return Response({'revision': state.revision})


@api_view(['GET', 'PUT'])
def workspace(request):
    from .bridge import read_workspace, save_workspace
    with transaction.atomic():
        get_user_model().objects.select_for_update().get(pk=request.user.pk)
        state, _ = WorkspaceState.objects.select_for_update().get_or_create(user=request.user)
        if request.method == 'GET':
            return Response(read_workspace(request.user, state))
        if request.data.get('workspaceId') is not None and str(request.data['workspaceId']) != str(request.user.pk):
            return Response({'detail': 'The signed-in account changed. Reopen the workspace before saving.'}, status=409)
        if type(request.data.get('revision')) is not int or request.data['revision'] != state.revision:
            return Response({'detail': 'This workspace changed elsewhere. Reload before saving.', 'revision': state.revision}, status=409)
        try:
            with transaction.atomic():
                save_workspace(request.user, state, request.data)
        except (ValidationError, ValueError, TypeError, KeyError, OverflowError, DecimalException) as error:
            detail = error.message_dict if hasattr(error, 'message_dict') else str(error)
            return Response({'detail': detail}, status=400)
        except IntegrityError:
            return Response({'detail': 'These records conflict with an existing reference or relationship. Reload and try again.'}, status=400)
        return Response({'revision': state.revision})
