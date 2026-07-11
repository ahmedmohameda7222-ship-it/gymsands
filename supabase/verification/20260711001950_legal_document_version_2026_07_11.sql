select key, value
from public.public_app_settings
where key = 'legal_document_versions';

select consent_type, version, granted, count(*) as account_count
from public.user_consents
where consent_type in ('terms', 'privacy', 'fitness_data', 'health_disclaimer', 'age_16', 'chatgpt_connection')
group by consent_type, version, granted
order by consent_type, version, granted;
