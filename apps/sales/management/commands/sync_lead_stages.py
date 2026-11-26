from django.core.management.base import BaseCommand

from apps.sales.models import Lead
from apps.sales.stages import sync_lead_stage


class Command(BaseCommand):
    help = "Recompute every lead's sales stage from its order (Lost leads are skipped)."

    def handle(self, *args, **options):
        changed = 0
        for lead in Lead.objects.select_related("order"):
            before = lead.stage
            sync_lead_stage(lead.order)
            lead.refresh_from_db()
            if lead.stage != before:
                changed += 1
        self.stdout.write(self.style.SUCCESS(f"{changed} lead(s) updated."))