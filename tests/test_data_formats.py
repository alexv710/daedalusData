"""
Tests for DaedalusData data format validation.

These tests verify that the data structures used by DaedalusData
conform to the expected formats documented in the README.
"""

import json
import os
import pytest
import numpy as np
from pathlib import Path

# Path to the data directory
DATA_DIR = Path(__file__).parent.parent / "data"


class TestMetadataFormat:
    """Tests for metadata JSON format."""

    def test_metadata_structure(self):
        """Metadata should be a flat dict with image names as keys."""
        metadata_path = DATA_DIR / "metadata" / "images.json"
        if not metadata_path.exists():
            pytest.skip("No metadata file found (run load_demo_dataset.ipynb first)")

        with open(metadata_path) as f:
            metadata = json.load(f)

        assert isinstance(metadata, dict), "Metadata should be a dictionary"
        
        # Each value should be a dict of attributes
        for image_name, attributes in metadata.items():
            assert isinstance(image_name, str), "Image names should be strings"
            assert isinstance(attributes, dict), f"Attributes for {image_name} should be a dict"

    def test_metadata_values_are_atomic(self):
        """Metadata values should be atomic (not nested objects)."""
        metadata_path = DATA_DIR / "metadata" / "images.json"
        if not metadata_path.exists():
            pytest.skip("No metadata file found")

        with open(metadata_path) as f:
            metadata = json.load(f)

        for image_name, attributes in metadata.items():
            for key, value in attributes.items():
                assert not isinstance(value, (dict, list)), \
                    f"Attribute '{key}' for '{image_name}' should be atomic, not {type(value).__name__}"


class TestProjectionFormat:
    """Tests for projection JSON format."""

    def test_projection_manifest_exists(self):
        """Projection manifest should list available projections."""
        manifest_path = DATA_DIR / "projections" / "projection_manifest.json"
        if not manifest_path.exists():
            pytest.skip("No projection manifest found (run Dimensionality_Reduction.ipynb first)")

        with open(manifest_path) as f:
            manifest = json.load(f)

        assert isinstance(manifest, list), "Manifest should be a list of filenames"
        assert all(isinstance(f, str) for f in manifest), "All entries should be strings"

    def test_projection_file_structure(self):
        """Projection files should contain image coordinates."""
        manifest_path = DATA_DIR / "projections" / "projection_manifest.json"
        if not manifest_path.exists():
            pytest.skip("No projection manifest found")

        with open(manifest_path) as f:
            manifest = json.load(f)

        if not manifest:
            pytest.skip("No projections in manifest")

        # Test the first projection file
        projection_path = DATA_DIR / "projections" / manifest[0]
        with open(projection_path) as f:
            projection = json.load(f)

        assert isinstance(projection, list), "Projection should be a list of points"
        
        if projection:
            point = projection[0]
            assert "image" in point, "Each point should have an 'image' field"
            # Should have coordinate fields (e.g., UMAP1, UMAP2 or similar)
            coord_fields = [k for k in point.keys() if k != "image"]
            assert len(coord_fields) >= 2, "Each point should have at least 2 coordinate fields"


class TestFeatureFormat:
    """Tests for feature file formats."""

    def test_npz_feature_format(self):
        """NPZ features should contain image_names and features arrays."""
        features_dir = DATA_DIR / "features"
        if not features_dir.exists():
            pytest.skip("No features directory found")

        npz_files = list(features_dir.glob("*.npz"))
        if not npz_files:
            pytest.skip("No NPZ feature files found (run feature_extraction.ipynb first)")

        for npz_path in npz_files:
            data = np.load(npz_path)
            
            assert "image_names" in data or "features" in data, \
                f"{npz_path.name} should contain 'image_names' or 'features' array"
            
            if "image_names" in data and "features" in data:
                assert len(data["image_names"]) == len(data["features"]), \
                    f"Number of image names should match number of feature vectors in {npz_path.name}"


class TestLabelFormat:
    """Tests for label alphabet format."""

    def test_label_alphabet_structure(self):
        """Label alphabets should have required fields."""
        labels_dir = DATA_DIR / "labels"
        if not labels_dir.exists():
            pytest.skip("No labels directory found")

        alphabet_files = list(labels_dir.glob("alphabet_*.json"))
        if not alphabet_files:
            pytest.skip("No label alphabets found")

        for alphabet_path in alphabet_files:
            with open(alphabet_path) as f:
                alphabet = json.load(f)

            assert "id" in alphabet, "Alphabet should have an 'id'"
            assert "name" in alphabet, "Alphabet should have a 'name'"
            assert "labels" in alphabet, "Alphabet should have 'labels'"
            assert isinstance(alphabet["labels"], list), "'labels' should be a list"

            for label in alphabet["labels"]:
                assert "id" in label, "Each label should have an 'id'"
                assert "value" in label, "Each label should have a 'value'"
                assert "images" in label, "Each label should have an 'images' list"
                assert isinstance(label["images"], list), "'images' should be a list"


class TestImageDirectory:
    """Tests for image directory structure."""

    def test_images_are_png(self):
        """All images should be PNG files."""
        images_dir = DATA_DIR / "images"
        if not images_dir.exists():
            pytest.skip("No images directory found")

        image_files = list(images_dir.glob("*"))
        if not image_files:
            pytest.skip("No images found (run load_demo_dataset.ipynb first)")

        for img_path in image_files:
            if img_path.is_file():
                assert img_path.suffix.lower() == ".png", \
                    f"Image {img_path.name} should be a PNG file"

    def test_images_match_metadata(self):
        """Image filenames should match metadata keys."""
        images_dir = DATA_DIR / "images"
        metadata_path = DATA_DIR / "metadata" / "images.json"
        
        if not images_dir.exists() or not metadata_path.exists():
            pytest.skip("Images or metadata not found")

        with open(metadata_path) as f:
            metadata = json.load(f)

        image_names = {p.stem for p in images_dir.glob("*.png")}
        metadata_keys = set(metadata.keys())

        # Check for images without metadata
        missing_metadata = image_names - metadata_keys
        assert not missing_metadata, \
            f"Images without metadata entries: {missing_metadata}"
