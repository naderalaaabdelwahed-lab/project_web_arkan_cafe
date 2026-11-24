
alter table public.inventory_order_deductions
  alter column order_item_id drop not null;

alter table public.inventory_order_deductions
  drop constraint if exists inventory_order_deductions_order_item_id_fkey;

alter table public.inventory_order_deductions
  add constraint inventory_order_deductions_order_item_id_fkey
  foreign key (order_item_id)
  references public.order_items(id)
  on delete set null;
