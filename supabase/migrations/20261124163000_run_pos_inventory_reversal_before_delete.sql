
drop trigger if exists trg_pos_order_item_inventory on public.order_items;
drop trigger if exists trg_pos_order_item_inventory_insert_update on public.order_items;
drop trigger if exists trg_pos_order_item_inventory_delete on public.order_items;

create trigger trg_pos_order_item_inventory_insert_update
after insert or update of order_id, quantity
on public.order_items
for each row execute function public.handle_pos_order_item_inventory();

create trigger trg_pos_order_item_inventory_delete
before delete
on public.order_items
for each row execute function public.handle_pos_order_item_inventory();
