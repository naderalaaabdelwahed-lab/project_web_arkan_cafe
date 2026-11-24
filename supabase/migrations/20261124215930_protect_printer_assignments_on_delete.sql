-- Keep printer history and product routing intact.
alter table public.products
  drop constraint if exists products_printer_id_fkey;
alter table public.products
  add constraint products_printer_id_fkey
  foreign key (printer_id) references public.printers(id) on delete restrict;

alter table public.order_items
  drop constraint if exists order_items_printer_id_fkey;
alter table public.order_items
  add constraint order_items_printer_id_fkey
  foreign key (printer_id) references public.printers(id) on delete restrict;
