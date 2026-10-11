import uuid
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from accounts.models import ExternalIdentity


class Command(BaseCommand):
    help = 'Link an explicitly identified Entra user to an existing planner account.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('tenant_id', type=uuid.UUID)
        parser.add_argument('object_id', type=uuid.UUID)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            user = get_user_model().objects.get(username=options['username'], is_active=True)
        except get_user_model().DoesNotExist as error:
            raise CommandError('Choose an existing active planner username.') from error
        identity, created = ExternalIdentity.objects.get_or_create(
            tenant_id=options['tenant_id'], object_id=options['object_id'], defaults={'user': user})
        if identity.user_id != user.pk:
            raise CommandError('This identity is already linked to another account; no change was made.')
        self.stdout.write(self.style.SUCCESS('Identity linked.' if created else 'Identity already linked.'))
