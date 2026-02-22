CREATE UNIQUE INDEX clients_client_legal_name_unique
ON public.clients (LOWER(TRIM(client_legal_name)));