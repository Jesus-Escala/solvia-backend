import { z } from 'zod';

/** Pin colors of the spots (the app draws them with its theme tokens). */
export const SPOT_COLORS = ['primary', 'info', 'success', 'warning', 'danger', 'accent'] as const;

/** Position on the plan as a fraction of its width or height. */
const fraction = z.coerce.number('Expected a number').min(0).max(1);

export const mapSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const updateMapSchema = z
  .object({
    name: mapSchema.shape.name,
    position: z.coerce.number().int().min(0).max(999),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

/** Sent with the plan's picture: its width / height, so the plan keeps its shape. */
export const mapImageSchema = z.object({
  aspect: z.coerce.number('Expected a number').min(0.2).max(5).default(1.5),
});

export const spotSchema = z.object({
  name: z.string().trim().min(1).max(60),
  x: fraction,
  y: fraction,
  color: z.enum(SPOT_COLORS).default('primary'),
});

export const updateSpotSchema = z
  .object({
    name: spotSchema.shape.name,
    x: fraction,
    y: fraction,
    color: z.enum(SPOT_COLORS),
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
