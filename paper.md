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

DaedalusData is an open-source tool for exploring and labeling collections of 2D images. It shows a collection as a two-dimensional projection of image thumbnails, computed from image features, metadata or both, and lets users filter, select and label images in the same web interface. It is meant for the early phase of an analysis, when the categories that matter have not been decided yet and the labels are the result of the work. Users build several sets of labels, called label alphabets, while looking at the data, and feed them back into the projection. DaedalusData runs locally with Docker Compose, so the data stays on the user's machine.

# Statement of need

Many scientific image collections come without a taxonomy. Before a classifier can be trained or an annotation campaign planned, someone has to look through thousands of images, find the patterns that recur and give them names. That person is usually a domain expert who can run a Jupyter notebook but should not have to build or host a web application to do this work. Existing tools split this work in two: some project a collection for visual inspection, others apply a label schema that already exists. Moving between them means exporting, scripting and re-importing data.

DaedalusData puts both steps into one loop. Users explore a projection, select groups of images with a lasso or metadata filters, assign them to labels, and recompute the projection with those labels included. Several label alphabets can describe the same collection from different perspectives. The target users are researchers who have to categorize an image collection before they know which categories it contains.

# State of the field

\autoref{tab:tools} compares DaedalusData with open-source tools that cover parts of this workflow.

| Tool | Works on | Projection | Labeling | Labels change the projection |
|:--|:--|:--|:--|:--|
| Fiji with plugins | Stacks, folders, regions | Separate plugin | Separate plugin | No |
| napari-clusters-plotter | Objects in a segmented image | Yes | Cluster annotation | No |
| PixPlot | Image collections | Yes | No | No |
| CVAT, Label Studio | Single images | No | Yes | No |
| FiftyOne | Image datasets | Yes | Yes | Not built in |
| DaedalusData | 2D image collections | Yes | Yes | Yes |

: Open-source tools for exploring and labeling images. \label{tab:tools}

In the ImageJ ecosystem [@schindelin2012fiji], one plugin projects an image stack, a folder of images or a results table into a scatter plot [@antinos2020dr], and the plugins of @thomas2021fiji assign categories to images or regions of interest. The two do not share state, so a category assigned in one can neither be seen in the other nor used in the projection. napari [@sofroniew2019napari] with napari-clusters-plotter [@zigutyte2025clusters] offers UMAP and t-SNE with lasso selection, but for measurements of objects segmented in one image rather than for a collection of images. ilastik [@berg2019ilastik] and QuPath [@bankhead2017qupath] train pixel and object classifiers and assume that the classes are known. PixPlot [@duhaime2017pixplot] lays out image thumbnails with UMAP but has no labeling. CVAT [@cvat2023] and Label Studio [@tkachenko2020labelstudio] apply an existing label schema image by image and show no overview of the collection.

FiftyOne [@moore2020fiftyone] is the closest in scope. It combines a sample grid, an embeddings panel with lasso selection, and tagging and annotation in one application. It is built for curating machine learning datasets: users typically bring a label schema and a model, and load data and compute embeddings in Python. Its built-in UMAP, t-SNE and PCA layouts are computed from the embeddings alone; labels color and filter the plot but do not change the layout. A label-informed layout requires computing modified embeddings or the points themselves in Python and passing them in. DaedalusData addresses the step before, when the label alphabets are still being developed and each revision can reshape the layout.

The approach follows the visual-interactive labeling process [@bernard2018vial], in which the user rather than a model chooses what to label next. @bernard2018comparing found this competitive with active learning when few labels exist.

# Software design

DaedalusData runs as one container with two parts: a Nuxt web application for exploration and labeling, and a Jupyter server with three notebooks that compute its inputs. All data is kept as plain files in a mounted `data/` directory: images, a metadata JSON file, features, projections, and label alphabets as JSON. Other tools can read and write these files directly.

The notebooks do the computation. The first loads the demo dataset; for another collection, the images and a metadata JSON file are copied into `data/` instead. The second computes a ResNet50 embedding [@he2016resnet] for each image and encodes the metadata as a table. The third computes UMAP projections [@mcinnes2018umap] of the image features, of image and metadata features combined, and, for each label alphabet, of the image features with the labels appended as one-hot columns. The notebooks are run as provided, so no code has to be written; changing the feature extractor or the projection method means editing Python in a notebook.

The web interface does everything else (\autoref{fig:ui}). It renders a projection as a field of thumbnails from an image atlas, supports zooming, metadata filters and lasso selection, and saves label assignments to disk immediately. Bar charts and violin plots summarize the metadata. To see how new labels change the layout, users re-run the projection notebook and reload the analysis view.

![The analysis view on the 809-image demo dataset. Left: projection selector, two label alphabets and metadata filters. Center: the projection, with labeled images framed in the color of their label. Right: violin and box plots of metadata attributes.\label{fig:ui}](docs/analysis-page.png)

# Research use

DaedalusData was developed in a design study with quality-control experts who investigate particle contamination in in-vitro diagnostics consumables. They used it to explore and label thousands of 2D particle images and to externalize their knowledge through label-informed projections; the case study and user study are reported in @wyss2025daedalusdata.

# Acknowledgments

This work builds upon research originally published in IEEE Transactions on Visualization and Computer Graphics [@wyss2025daedalusdata].

# References
