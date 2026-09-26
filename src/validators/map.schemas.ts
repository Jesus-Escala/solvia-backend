import { z } from 'zod';

/** Theme colors of the first spots (the app draws them with its tokens). */
export const SPOT_COLORS = ['primary', 'info', 'success', 'warning', 'danger', 'accent'] as const;

/** A theme color or any color picked by the business ("#0d9488"; stored in lowercase). */
const spotColorSchema = z.union([
  z.enum(SPOT_COLORS),
  z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a color like #0d9488')
    .transform((value) => value.toLowerCase()),
]);

/** Position on the plan as a fraction of its width or height. */
const fraction = z.coerce.number('Expected a number').min(0).max(1);
/** Size of an area as a fraction of the plan (from a thin shelf to the whole room). */
const size = z.coerce.number('Expected a number').min(0.01).max(1);

/** Width / height of a plan (a picture's, or the shape of a shop drawn in the app). */
const aspectSchema = z.coerce.number('Expected a number').min(0.2).max(5);

export const mapSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Shape of the plan when it is drawn in the app (without a picture). */
  aspect: aspectSchema.default(1.5),
});

export const updateMapSchema = z
  .object({
    name: mapSchema.shape.name,
    aspect: aspectSchema,
    position: z.coerce.number().int().min(0).max(999),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

/** Sent with the plan's picture: its width / height, so the plan keeps its shape. */
export const mapImageSchema = z.object({
  aspect: aspectSchema.default(1.5),
});

export const spotSchema = z.object({
  name: z.string().trim().min(1).max(60),
  x: fraction,
  y: fraction,
  w: size.default(0.1),
  h: size.default(0.08),
  color: spotColorSchema.default('primary'),
});

export const updateSpotSchema = z
  .object({
    name: spotSchema.shape.name,
    x: fraction,
    y: fraction,
    w: size,
    h: size,
    color: spotColorSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

/** Products placed in a spot (a product is in one spot at most: this moves it). */
export const spotProductsSchema = z.object({
  productIds: z.array(z.uuid('Invalid identifier')).min(1).max(200),
});

export const spotParamSchema = z.object({ spotId: z.uuid('Invalid identifier') });
export const spotProductParamSchema = spotParamSchema.extend({
  productId: z.uuid('Invalid identifier'),
});

export type MapInput = z.infer<typeof mapSchema>;
export type UpdateMapInput = z.infer<typeof updateMapSchema>;
export type SpotInput = z.infer<typeof spotSchema>;
export type UpdateSpotInput = z.infer<typeof updateSpotSchema>;
