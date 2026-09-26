-- A spot is an area of the plan (a shelf, a fridge), not just a point.
ALTER TABLE "map_spots" ADD COLUMN "w" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
ADD COLUMN "h" DOUBLE PRECISION NOT NULL DEFAULT 0.08;
