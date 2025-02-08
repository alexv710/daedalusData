PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS images (
    filename TEXT PRIMARY KEY,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vectors (
    filename TEXT,
    vector_type TEXT,
    vector_data BLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (filename, vector_type),
    FOREIGN KEY (filename) REFERENCES images(filename) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS labels (
    filename TEXT,
    label_type TEXT,
    label_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (filename, label_type),
    FOREIGN KEY (filename) REFERENCES images(filename) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vectors_filename ON vectors(filename);
CREATE INDEX IF NOT EXISTS idx_labels_filename ON labels(filename);