-- Restrict anonymous execution of administrative and inventory SECURITY DEFINER RPCs.
-- Public customer checkout, cancellation, and order-status RPCs remain callable by anon.

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_inventory_recipe(bigint, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_inventory_recipe(bigint, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_manual_inventory_movement(bigint, text, numeric, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_inventory_item(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_inventory_recipe(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_purchase_invoice_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_inventory_recipes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_customer_order_secure(text, text, text, text, text, text, jsonb, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(bigint, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_order_status(bigint, uuid) TO anon, authenticated, service_role;
