import { z } from 'zod';

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()\-]{5,25}$/, 'Invalid phone format')
  .min(5, 'Phone is too short')
  .max(25, 'Phone is too long');

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name is too short')
  .max(120, 'Name is too long');

const emailSchema = z.string().trim().email('Invalid email').optional().or(z.literal(''));

const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Text is too long. Max ${max} chars`)
    .optional()
    .or(z.literal(''));

const contactFormSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  msg: optionalText(3000),
  page: optionalText(255),
  formType: optionalText(120)
});

const calculatorFormSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  section: z.enum(['150x150', '200x200', '300x300', '350x350', '400x400']),
  length: z.coerce.number().positive().min(2).max(30),
  qty: z.coerce.number().int().positive().max(10000),
  options: z
    .object({
      mobilization: z.boolean().optional(),
      geology: z.boolean().optional(),
      cutting: z.boolean().optional(),
      staticTest: z.boolean().optional(),
      dynamicTest: z.boolean().optional()
    })
    .partial()
    .optional(),
  estimateText: optionalText(500),
  page: optionalText(255),
  formType: optionalText(120),
  msg: optionalText(3000)
});

export { contactFormSchema, calculatorFormSchema };
