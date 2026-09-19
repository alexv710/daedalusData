---
title: 'DaedalusData: A Dockerized Platform for Exploration, Knowledge Externalization and Labeling of Image Collections'
tags:
  - Python
  - JavaScript
  - Nuxt
  - Vue
  - Docker
  - Visual Analytics
  - Image Data
  - Data Labeling
  - Dimensionality Reduction
authors:
  - name: Alexander Wyss
    orcid: 0009-0009-2763-3186
    affiliation: "1, 2"
affiliations:
  - name: Independent Researcher
    index: 1
  - name: Roche pRED
    index: 2
date: 20 March 2025
bibliography: paper.bib
---

# Summary

DaedalusData is an open-source platform for exploring and labeling large image collections. It combines two-dimensional projections of image content and metadata with interactive filtering, selection and labeling in one web interface, and ships as a Docker Compose setup with Jupyter notebooks for feature extraction and projection. The tool grew out of a design study with domain experts in medical manufacturing [@wyss2025daedalusdata]. It is built for the phase of an analysis in which the categories of interest are not known yet and have to be worked out by looking at the data.

# Statement of need

Many scientific image collections arrive without a taxonomy. Before a classifier can be trained or an annotation campaign planned, someone has to look at thousands of images, work out which patterns recur, and turn them into a set of labels. That person is usually a domain expert, not a programmer. Tools for this phase tend to fall on one of two sides: they either project a collection into two dimensions and let the user look at it, or they let the user apply a label schema that already exists. Moving between the two means exporting, scripting and re-importing, which is the part a domain expert cannot be expected to do.

DaedalusData targets this pre-taxonomy phase. It provides:

1. Projections of an image collection from image features, metadata, or both, rendered as thumbnails rather than points so that clusters can be judged by eye.
2. Label alphabets: named sets of labels that are created, extended and reorganized while looking at the data. Several alphabets can coexist over the same collection.
3. Selection tools, such as lasso selection and metadata filters, for labeling many images at once.
4. Label-informed projections: an alphabet can be appended to the image features as additional attributes, so the layout reorganizes around what the expert has already externalized and exposes what is still unresolved.
5. A file-based data layout on mounted volumes and a Docker Compose setup, so that no database, server or Python environment has to be installed and the data stays under the user's control.

# State of the field

**ImageJ and the bio-image tools.** In the ImageJ ecosystem [@schindelin2012fiji] the individual pieces exist, but as separate plugins. A dimensionality reduction plugin projects an image stack, a folder of images or a results table with PCA, t-SNE or UMAP into an ImageJ scatter plot [@antinos2020dr]; the qualitative annotation plugins of @thomas2021fiji add a button panel for assigning categories to images or regions of interest. The two do not share state: a category assigned in one is not visible in the other, and neither offers a way to feed labels back into the projection. Fiji also remains centered on the single image or stack, so a collection of thousands of files has to be handled by combining plugins from different authors. The same holds for the neighboring tools. napari [@sofroniew2019napari] with napari-clusters-plotter [@zigutyte2025clusters] offers interactive UMAP and t-SNE with lasso selection, but operates on measurements derived from a segmented label image rather than on a set of images. ilastik [@berg2019ilastik] and QuPath [@bankhead2017qupath] are interactive pixel and object classifiers and assume that the classes are known.

**Exploration-only viewers.** PixPlot [@duhaime2017pixplot] and the TensorBoard Embedding Projector [@smilkov2016projector] render UMAP or t-SNE layouts of image embeddings, PixPlot with thumbnails, and both give a good overview of a collection. Neither has a labeling workflow: what is seen cannot be written down inside the tool.

**Annotation tools.** CVAT [@cvat2023] and Label Studio [@tkachenko2020labelstudio] are mature annotation platforms. They start from a label schema and optimize the throughput of applying it, image by image. They have no view of the collection as a whole and no embedding-based exploration.

**FiftyOne.** The closest tool in scope is FiftyOne [@moore2020fiftyone], an open-source dataset curation platform that combines a sample grid, an embeddings panel with box and lasso selection, and tagging and annotation in one application. The difference lies in the phase of the work each is built for. FiftyOne is aimed at machine learning dataset operations: the user typically arrives with a label schema and a model, uses the embedding view to audit and curate against them, and constructs the dataset and computes the embeddings in Python. Its embedding layout is unsupervised; labels color and filter the plot but do not enter its computation. DaedalusData is aimed at the step before. The label alphabets are the output rather than the input, several can coexist, and they enter the projection as attributes so that the layout changes as the expert's understanding does. The analyst writes no code: the data layout is plain files, and the notebooks are re-run only when features or projections change.

**Visual-interactive labeling.** The underlying process is what the visual analytics literature calls visual-interactive labeling [@bernard2018vial], in which the user rather than a model chooses what to label next. @bernard2018comparing showed this to be competitive with active learning early on, when few labels exist. DaedalusData packages that process for image collections in a form that can be deployed without programming. The design decisions behind it are documented in the original design study [@wyss2025daedalusdata].

# Architecture and Functionality

## System Overview

DaedalusData consists of two main components:

1. **Frontend**: A Nuxt-based web application that provides the user interface for exploration and labeling
2. **Jupyter Environment**: Integrated notebooks for feature extraction and dimensionality reduction

The entire system is containerized using Docker, allowing for consistent deployment across different environments. Users interact primarily through the web interface while having the option to customize feature extraction and dimensionality reduction parameters through the Jupyter notebooks.

## Data Organization

DaedalusData operates on a simple, file-based data structure with mounted directories:

- **Images**: Original image files (PNG format)
- **Metadata**: JSON files containing attributes associated with each image
- **Features**: Extracted features in CSV or NPZ format
- **Projections**: Dimensionality reduction results for visualization
- **Labels**: User-defined label alphabets and assignments

This file-based approach makes it easy to exchange data with other tools in a scientific workflow and removes the need for a database or a backend service. Researchers can inspect, modify or reuse their data with whatever tools they already have.

## Key Features

### Interactive Image Exploration

DaedalusData provides two primary exploration modes:

1. **Projection View**: Displays images in a 2D space based on dimensionality reduction of selected attributes
2. **Label-Informed Projection View**: Includes one or more label alphabets in the dimensionality reduction, so the layout reflects both the image features and the labels assigned so far.

Both views support interactive zooming, panning, and filtering, allowing users to navigate through thousands of images efficiently. Users can customize the visualization by adjusting image size and transparency to reduce visual clutter.

### Knowledge Externalization

The central mechanism in DaedalusData is the loop between labeling and projection. As users assign labels to images, these labels can be appended to the feature vectors as additional attributes before dimensionality reduction, producing projections that reflect both image features and expert knowledge. This creates a feedback loop where:

1. Initial projections guide users to discover patterns
2. Users label images based on discovered patterns
3. Label-informed projections reveal new patterns incorporating expert knowledge
4. Additional labels are created, further refining the projections

Each pass through the loop leaves the dataset with more of the expert's knowledge written down as labels.

### Efficient Labeling

DaedalusData accelerates the labeling process through:

- Multi-selection tools for labeling many images simultaneously
- Label alphabets to organize related labels into meaningful collections
- Persistence of selections across different views and projections
- Visual encoding of labeled images for easy identification

### Integration with Scientific Workflows

DaedalusData integrates with existing scientific workflows through:

- Template Jupyter notebooks for customizable feature extraction using standard libraries (e.g., TensorFlow, scikit-learn)
- Mounted volumes for easy data interchange with other tools

# Usage Examples

DaedalusData was originally designed for analysing single object images, but has been applied to diverse image analysis tasks since, including:

1. Medical image analysis for identifying patterns in diagnostic images
2. Materials science for classifying microscopy images
3. General-purpose image exploration and labeling tasks

In each case, the system enabled researchers to interactively explore their image collections, discover meaningful patterns, and efficiently create labeled datasets for further analysis.

# Conclusion

DaedalusData covers the part of an image analysis that comes before a label schema exists: looking at a collection, developing categories, and writing them down as labels that in turn reshape the view. It does so in a single deployable package, so that domain experts can do this work themselves rather than through a programmer.

# Acknowledgments

This work builds upon research originally published in IEEE Transactions on Visualization and Computer Graphics [@wyss2025daedalusdata].

# References
