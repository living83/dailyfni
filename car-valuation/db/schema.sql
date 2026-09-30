CREATE TABLE IF NOT EXISTS car_price_cache (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    model         TEXT    NOT NULL,
    year          INTEGER NOT NULL,
    site          TEXT    NOT NULL,
    median_price  INTEGER,
    sample_count  INTEGER,
    samples_json  TEXT,
    fetched_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model, year, site)
);

CREATE INDEX IF NOT EXISTS idx_car_price_cache_fetched_at
    ON car_price_cache(fetched_at);

CREATE INDEX IF NOT EXISTS idx_car_price_cache_lookup
    ON car_price_cache(model, year, site);

CREATE TABLE IF NOT EXISTS unmatched_models (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_input     TEXT    NOT NULL,
    site          TEXT    NOT NULL,
    best_guess    TEXT,
    score         REAL,
    seen_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
