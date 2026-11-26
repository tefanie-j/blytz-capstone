"""Small HTTP helpers shared by staff views."""

from urllib.parse import urlencode

from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.cache import patch_vary_headers


def is_modal_request(request) -> bool:
    """True when the staff modal (static/js/staff_modal.js) is asking for a page.

    The modal fetches the detail URL and sends ``X-Requested-With: XMLHttpRequest``.
    """
    return request.headers.get("X-Requested-With") == "XMLHttpRequest"


def render_modal(request, template, context, list_url_name):
    """Render a detail view for the staff modal.

    These details only exist as a modal. If someone opens the URL directly
    (bookmark, new tab, old link), send them to the list page with ``?open=<path>``;
    the modal script then opens this item on top of the list.
    """
    if not is_modal_request(request):
        target = f"{reverse(list_url_name)}?{urlencode({'open': request.path})}"
        response = redirect(target)
    else:
        response = render(request, template, {**context, "modal": True})
    patch_vary_headers(response, ("X-Requested-With",))
    return response