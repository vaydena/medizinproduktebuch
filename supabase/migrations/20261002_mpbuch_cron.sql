-- Tägliche Fristenübersicht (STK/MTK) per Mail – nur für Einrichtungen mit Opt-in (settings.due_mail).
-- Erst anwenden, wenn mpb-public deployt ist. Voraussetzung: Extensions pg_cron und pg_net (im Projekt vorhanden).
select cron.schedule('mpbuch-due-mail', '45 4 * * *', $$
  select net.http_post(
    url := 'https://xeuexovdipdiiuzjpzkj.supabase.co/functions/v1/mpb-public',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"cron_due_mail"}'::jsonb)
$$);
