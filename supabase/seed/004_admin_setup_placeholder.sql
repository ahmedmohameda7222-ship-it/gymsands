-- Optional: make your own account an admin after registering on the deployed Netlify site.

update public.profiles
set role = 'admin'
where lower(email) = lower('ahmeedmostafaa@hotmail.com');
