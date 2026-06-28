-- Defense-in-depth: revoke column-level access to sensitive Stripe IDs and ticket QR codes
-- from the authenticated role. Service-role (edge functions) retains full access.

-- profiles: hide Stripe identifiers from client reads. subscription_status and
-- subscription_product_id remain readable for client gating logic.
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.profiles FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.profiles FROM anon;

-- event_rsvps: ticket QR codes must only be issued via server-side check-in flows.
REVOKE SELECT (ticket_qr_code) ON public.event_rsvps FROM authenticated;
REVOKE SELECT (ticket_qr_code) ON public.event_rsvps FROM anon;