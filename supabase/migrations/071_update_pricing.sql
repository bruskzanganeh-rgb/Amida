-- Update pricing: Pro $9.99/mo ($5.99/mo annual), Team $19.99/mo ($11.99/mo annual)
UPDATE platform_config SET value = '9.99' WHERE key = 'pro_price_monthly';
UPDATE platform_config SET value = '71.88' WHERE key = 'pro_price_yearly';
UPDATE platform_config SET value = '19.99' WHERE key = 'team_price_monthly';
UPDATE platform_config SET value = '143.88' WHERE key = 'team_price_yearly';
