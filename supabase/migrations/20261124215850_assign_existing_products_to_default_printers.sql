-- Existing products inherit the default printer for their current preparation station.
-- Managers can reassign each product individually from the menu editor later.
update public.products p
set printer_id = pr.id
from public.printers pr
where p.printer_id is null
  and pr.printer_key = case
    when p.preparation_station = 'bar' then 'default-bar'
    else 'default-kitchen'
  end;
