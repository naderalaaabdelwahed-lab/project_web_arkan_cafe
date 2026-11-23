ALTER POLICY inventory_items_select ON public.inventory_items
USING (
  has_permission('inventory.view')
  OR has_permission('inventory.items.manage')
  OR has_permission('inventory.reports.view')
);

ALTER POLICY inventory_units_select ON public.inventory_units
USING (
  has_permission('inventory.view')
  OR has_permission('inventory.items.manage')
  OR has_permission('inventory.reports.view')
);

ALTER POLICY inventory_movements_select ON public.inventory_movements
USING (
  has_permission('inventory.view')
  OR has_permission('inventory.purchases.manage')
  OR has_permission('inventory.movements.manage')
  OR has_permission('inventory.reports.view')
);

ALTER POLICY inventory_purchases_select ON public.inventory_purchases
USING (
  has_permission('inventory.view')
  OR has_permission('inventory.purchases.manage')
  OR has_permission('inventory.reports.view')
);

ALTER POLICY inventory_purchase_items_select ON public.inventory_purchase_items
USING (
  has_permission('inventory.view')
  OR has_permission('inventory.purchases.manage')
  OR has_permission('inventory.reports.view')
);

ALTER POLICY inventory_suppliers_select ON public.inventory_suppliers
USING (
  has_permission('inventory.view')
  OR has_permission('inventory.purchases.manage')
  OR has_permission('inventory.reports.view')
);
