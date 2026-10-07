-- Migration 0003: Add travel_minutes column and support pink theme
ALTER TABLE settings ADD COLUMN travel_minutes INTEGER DEFAULT 35;
