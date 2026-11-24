-- Add an explicit preparation department to menu categories.
-- Existing "مشروبات" belongs to the bar; existing food categories stay in the kitchen.
alter table public.categories
  add column if not exists department text not null default 'kitchen';

update public.categories
set department = case when name = 'مشروبات' then 'bar' else 'kitchen' end
where name = 'مشروبات';

alter table public.categories
  drop constraint if exists categories_department_check;

alter table public.categories
  add constraint categories_department_check
  check (department in ('kitchen', 'bar'));

create index if not exists categories_department_active_order_idx
  on public.categories (department, is_active, display_order, id);
