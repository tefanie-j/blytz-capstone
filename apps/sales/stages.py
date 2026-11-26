from apps.designs.models import ActivityLog
from apps.orders.models import Order

from .models import Lead


def derive_stage(order):
    """Work out the sales stage from the order's job status."""
    S = Lead.Stage
    if order.status == Order.Status.COMPLETED:
        return S.COMPLETED
    if order.status == Order.Status.PRODUCTION:
        return S.IN_PRODUCTION
    if order.status == Order.Status.PENDING_EDIT:
        return S.DESIGN_REVIEW
    return S.ORDER_CONFIRMED


def sync_lead_stage(order):
    """Move the order's lead to the derived stage. Lost leads are left alone."""
    lead = Lead.objects.select_related("customer").filter(order=order).first()
    if lead is None or lead.stage == Lead.Stage.LOST:
        return
    new_stage = derive_stage(order)
    if lead.stage == new_stage:
        return
    old_label = lead.get_stage_display()
    lead.stage = new_stage
    lead.save(update_fields=["stage"])
    ActivityLog.objects.create(
        customer=lead.customer,
        design_id=order.design_id,
        order=order,
        kind=ActivityLog.Kind.LEAD_STAGE_CHANGED,
        detail=f"{old_label} → {lead.get_stage_display()} · automatic",
    )