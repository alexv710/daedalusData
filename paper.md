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
    affiliation:
      - "1"
      - "2"
affiliations:
  - name: Independent Researcher
    index: 1
  - name: Roche pRED
    index: 2
date: 20 March 2025
bibliography: paper.bib
---

# Summary

DaedalusData is an open-source visual analytics platform designed for interactive exploration, knowledge externalization, and labeling of large image collections. It provides researchers and data scientists with a flexible and accessible environment for analyzing image datasets without requiring advanced technical skills. The system combines dimensionality reduction techniques for visual exploration with interactive filtering and selection tools, enabling users to label images efficiently and externalize their domain knowledge through customizable label alphabets. DaedalusData is fully dockerized for easy deployment and includes integrated Jupyter notebooks for feature extraction and dimensionality reduction, making it accessible to users without extensive programming or infrastructure expertise.

# Statement of Need

The visual exploration and labeling of large image collections is a common challenge across diverse scientific fields. Researchers frequently need to analyze thousands of images, discover patterns, extract knowledge, and create labeled datasets for downstream analysis. While numerous tools exist for specific aspects of this workflow, there remains a gap. DaedalusData fills this gap for analysis tasks that are in a very explorative phase, where the user still needs to develop the label alphabets and explore the data to understand the patterns.

Existing image exploration tools often require significant technical expertise to install and operate, focus exclusively on either visual exploration or labeling (through active learning), or lack the flexibility needed for domain-specific adaptations. Commercial tools can be expensive and closed-source, limiting accessibility and customization. Meanwhile, custom implementations require considerable development effort and often result in solutions that aren't generalizable across disciplines.

DaedalusData addresses these challenges by providing a unified, accessible platform that enables researchers to:

1. Explore large image collections through interactive visualizations based on image content and metadata
2. Create and maintain multiple label alphabets that reflect diverse domain perspectives
3. Efficiently label images through interactive selection tools and similarity-preserving projections
4. Externalize expert knowledge through semi-supervised label-informed projections
5. Deploy the entire system with minimal setup via Docker, requiring no specialized infrastructure

By combining these capabilities in an easy-to-deploy package, DaedalusData democratizes access to sophisticated image analysis techniques, enabling researchers across disciplines to gain insights from their image collections more efficiently.

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

This straightforward, file-based approach enhances interoperability with other tools in scientific workflows and eliminates the need for database expertise or complex backend infrastructure. Researchers can easily inspect, modify, or integrate their data with other scientific tools.

## Key Features

### Interactive Image Exploration

DaedalusData provides two primary exploration modes:

1. **Projection View**: Displays images in a 2D space based on dimensionality reduction of selected attributes
2. **(Semi-)Supervised Projection View**: Include one or more label alphabets into the dimensionality reduction process, allowing for label-informed projections that improve as the user externalizes knowledge.

Both views support interactive zooming, panning, and filtering, allowing users to navigate through thousands of images efficiently. Users can customize the visualization by adjusting image size and transparency to reduce visual clutter.

### Knowledge Externalization

A key innovation in DaedalusData is its support for knowledge externalization through label-informed projections. As users assign labels to images, these labels can be incorporated as additional attributes in the dimensionality reduction process, creating projections that reflect both image features and expert knowledge. This creates a feedback loop where:

1. Initial projections guide users to discover patterns
2. Users label images based on discovered patterns
3. Label-informed projections reveal new patterns incorporating expert knowledge
4. Additional labels are created, further refining the projections

This iterative process enables the progressive enrichment of the dataset with expert knowledge.

### Efficient Labeling

DaedalusData accelerates the labeling process through:

- Multi-selection tools for labeling many images simultaneously
- Label alphabets to organize related labels into meaningful collections
- Persistence of selections across different views and projections
- Visual encoding of labeled images for easy identification

The combination of efficient labeling tools with exploratory visualization significantly reduces the time required to create high-quality labeled datasets.

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

DaedalusData fills an important gap in the scientific software ecosystem by providing an accessible, comprehensive platform for the exploration, knowledge externalization, and labeling of image collections. By combining interactive visualization, efficient labeling tools, and easy deployment through Docker, DaedalusData enables researchers across disciplines to gain insights from their image data more effectively.

# Acknowledgments

This work builds upon research originally published in IEEE Transactions on Visualization and Computer Graphics [@wyss2025daedalusdata].

# References

[@wyss2025daedalusdata]: Wyss, A., Morgenshtern, G., Hirsch-Hüsler, A., & Bernard, J. (2025). DaedalusData: Exploration, Knowledge Externalization and Labeling of Particles in Medical Manufacturing — A Design Study. IEEE Transactions on Visualization and Computer Graphics, 31(1), 54-64. https://doi.org/10.1109/TVCG.2024.3456329