import { z } from 'zod';

export const accountCredentialsSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z.email('Укажите корректный email.').max(254, 'Email должен быть не длиннее 254 символов.'),
    ),
  password: z
    .string()
    .min(12, 'Пароль должен содержать не менее 12 символов.')
    .max(128, 'Пароль должен быть не длиннее 128 символов.'),
});

export type AccountCredentials = z.infer<typeof accountCredentialsSchema>;
