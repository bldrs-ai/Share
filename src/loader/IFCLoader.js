// DO NOT EDIT - generated code
/* eslint-disable */
import * as WebIFC from 'web-ifc';
import { IFCSPACE, IFCOPENINGELEMENT, IFCPRODUCTDEFINITIONSHAPE, IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELDEFINESBYPROPERTIES, IFCRELASSOCIATESMATERIAL, IFCRELDEFINESBYTYPE, IFCPROJECT, IFCBUILDING } from 'web-ifc';
import { Mesh, Color, MeshLambertMaterial, DoubleSide, Matrix4, BufferGeometry, BufferAttribute, Loader, FileLoader } from 'three';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const nullIfcManagerErrorMessage = 'IfcManager is null!';

class IFCModel extends Mesh {

  constructor() {
    super(...arguments);
    this.modelID = IFCModel.modelIdCounter++;
    this.ifcManager = null;
    this.mesh = this;
  }

  static dispose() {
    IFCModel.modelIdCounter = 0;
  }

  setIFCManager(manager) {
    this.ifcManager = manager;
  }

  setWasmPath(path) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    this.ifcManager.setWasmPath(path);
  }

  close(scene) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    this.ifcManager.close(this.modelID, scene);
  }

  getExpressId(geometry, faceIndex) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getExpressId(geometry, faceIndex);
  }

  getAllItemsOfType(type, verbose) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getAllItemsOfType(this.modelID, type, verbose);
  }

  getItemProperties(id, recursive = false) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getItemProperties(this.modelID, id, recursive);
  }

  getPropertySets(id, recursive = false) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getPropertySets(this.modelID, id, recursive);
  }

  getTypeProperties(id, recursive = false) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getTypeProperties(this.modelID, id, recursive);
  }

  getIfcType(id) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getIfcType(this.modelID, id);
  }

  getSpatialStructure() {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getSpatialStructure(this.modelID);
  }

  getSubset(material) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    return this.ifcManager.getSubset(this.modelID, material);
  }

  removeSubset(material, customID) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    this.ifcManager.removeSubset(this.modelID, material, customID);
  }

  createSubset(config) {
    if (this.ifcManager === null)
      throw new Error(nullIfcManagerErrorMessage);
    const modelConfig = {
      ...config,
      modelID: this.modelID
    };
    return this.ifcManager.createSubset(modelConfig);
  }

}

IFCModel.modelIdCounter = 0;

class IFCParser {

  constructor(state, BVH) {
    this.state = state;
    this.BVH = BVH;
    this.loadedModels = 0;
    this.optionalCategories = {
      [IFCSPACE]: true,
      [IFCOPENINGELEMENT]: false
    };
    this.geometriesByMaterials = {};
    this.loadingState = {
      total: 0,
      current: 0,
      step: 0.1
    };
    this.currentWebIfcID = -1;
    this.currentModelID = -1;
  }

  async setupOptionalCategories(config) {
    this.optionalCategories = config;
  }

  async parse(buffer, coordinationMatrix) {
    if (this.state.api.wasmModule === undefined)
      await this.state.api.Init();
    await this.newIfcModel(buffer);
    this.loadedModels++;
    if (coordinationMatrix) {
      await this.state.api.SetGeometryTransformation(this.currentWebIfcID, coordinationMatrix);
    }
    return this.loadAllGeometry(this.currentWebIfcID);
  }

  getAndClearErrors(_modelId) {}

  notifyProgress(loaded, total) {
    if (this.state.onProgress)
      this.state.onProgress({
        loaded,
        total
      });
  }

  async newIfcModel(buffer) {
    const data = new Uint8Array(buffer);
    this.currentWebIfcID = await this.state.api.OpenModel(data, this.state.webIfcSettings);
    this.currentModelID = this.state.useJSON ? this.loadedModels : this.currentWebIfcID;
    this.state.models[this.currentModelID] = {
      modelID: this.currentModelID,
      mesh: {},
      types: {},
      jsonData: {}
    };
  }

  async loadAllGeometry(modelID) {
    this.addOptionalCategories(modelID);
    await this.initializeLoadingState(modelID);
    this.state.api.StreamAllMeshes(modelID, (mesh) => {
      this.updateLoadingState();
      this.streamMesh(modelID, mesh);
    });
    this.notifyLoadingEnded();
    const geometries = [];
    const materials = [];
    Object.keys(this.geometriesByMaterials).forEach((key) => {
      const geometriesByMaterial = this.geometriesByMaterials[key].geometries;
      const merged = mergeBufferGeometries(geometriesByMaterial);
      materials.push(this.geometriesByMaterials[key].material);
      geometries.push(merged);
    });
    const combinedGeometry = mergeBufferGeometries(geometries, true);
    this.cleanUpGeometryMemory(geometries);
    if (this.BVH)
      this.BVH.applyThreeMeshBVH(combinedGeometry);
    const model = new IFCModel(combinedGeometry, materials);
    this.state.models[this.currentModelID].mesh = model;
    return model;
  }

  async initializeLoadingState(modelID) {
    const shapes = await this.state.api.GetLineIDsWithType(modelID, IFCPRODUCTDEFINITIONSHAPE);
    this.loadingState.total = shapes.size();
    this.loadingState.current = 0;
    this.loadingState.step = 0.1;
  }

  notifyLoadingEnded() {
    this.notifyProgress(this.loadingState.total, this.loadingState.total);
  }

  updateLoadingState() {
    const realCurrentItem = Math.min(this.loadingState.current++, this.loadingState.total);
    if (realCurrentItem / this.loadingState.total >= this.loadingState.step) {
      const currentProgress = Math.ceil(this.loadingState.total * this.loadingState.step);
      this.notifyProgress(currentProgress, this.loadingState.total);
      this.loadingState.step += 0.1;
    }
  }

  addOptionalCategories(modelID) {
    const optionalTypes = [];
    for (let key in this.optionalCategories) {
      if (this.optionalCategories.hasOwnProperty(key)) {
        const category = parseInt(key);
        if (this.optionalCategories[category])
          optionalTypes.push(category);
      }
    }
    this.state.api.StreamAllMeshesWithTypes(this.currentWebIfcID, optionalTypes, (mesh) => {
      this.streamMesh(modelID, mesh);
    });
  }

  streamMesh(modelID, mesh) {
    const placedGeometries = mesh.geometries;
    const size = placedGeometries.size();
    for (let i = 0; i < size; i++) {
      const placedGeometry = placedGeometries.get(i);
      let itemMesh = this.getPlacedGeometry(modelID, mesh.expressID, placedGeometry);
      let geom = itemMesh.geometry.applyMatrix4(itemMesh.matrix);
      this.storeGeometryByMaterial(placedGeometry.color, geom);
    }
  }

  getPlacedGeometry(modelID, expressID, placedGeometry) {
    const geometry = this.getBufferGeometry(modelID, expressID, placedGeometry);
    const mesh = new Mesh(geometry);
    mesh.matrix = this.getMeshMatrix(placedGeometry.flatTransformation);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  getBufferGeometry(modelID, expressID, placedGeometry) {
    const geometry = this.state.api.GetGeometry(modelID, placedGeometry.geometryExpressID);
    const verts = this.state.api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
    const indices = this.state.api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
    const buffer = this.ifcGeometryToBuffer(expressID, verts, indices);
    geometry.delete();
    return buffer;
  }

  storeGeometryByMaterial(color, geometry) {
    let colID = `${color.x}${color.y}${color.z}${color.w}`;
    if (this.geometriesByMaterials[colID]) {
      this.geometriesByMaterials[colID].geometries.push(geometry);
      return;
    }
    const col = new Color().setRGB(color.x, color.y, color.z, 'srgb');
    const material = new MeshLambertMaterial({
      color: col,
      side: DoubleSide
    });
    material.transparent = color.w !== 1;
    if (material.transparent)
      material.opacity = color.w;
    this.geometriesByMaterials[colID] = {
      material,
      geometries: [geometry]
    };
  }

  getMeshMatrix(matrix) {
    const mat = new Matrix4();
    mat.fromArray(matrix);
    return mat;
  }

  ifcGeometryToBuffer(expressID, vertexData, indexData) {
    const geometry = new BufferGeometry();
    const posFloats = new Float32Array(vertexData.length / 2);
    const normFloats = new Float32Array(vertexData.length / 2);
    const idAttribute = new Uint32Array(vertexData.length / 6);
    for (let i = 0; i < vertexData.length; i += 6) {
      posFloats[i / 2] = vertexData[i];
      posFloats[i / 2 + 1] = vertexData[i + 1];
      posFloats[i / 2 + 2] = vertexData[i + 2];
      normFloats[i / 2] = vertexData[i + 3];
      normFloats[i / 2 + 1] = vertexData[i + 4];
      normFloats[i / 2 + 2] = vertexData[i + 5];
      idAttribute[i / 6] = expressID;
    }
    geometry.setAttribute('position', new BufferAttribute(posFloats, 3));
    geometry.setAttribute('normal', new BufferAttribute(normFloats, 3));
    geometry.setAttribute('expressID', new BufferAttribute(idAttribute, 1));
    geometry.setIndex(new BufferAttribute(indexData, 1));
    return geometry;
  }

  cleanUpGeometryMemory(geometries) {
    geometries.forEach(geometry => geometry.dispose());
    Object.keys(this.geometriesByMaterials).forEach((materialID) => {
      const geometriesByMaterial = this.geometriesByMaterials[materialID];
      geometriesByMaterial.geometries.forEach(geometry => geometry.dispose());
      geometriesByMaterial.geometries = [];
      geometriesByMaterial.material = null;
    });
    this.geometriesByMaterials = {};
  }

}

class ItemsMap {

  constructor(state) {
    this.state = state;
    this.map = {};
  }

  generateGeometryIndexMap(modelID) {
    if (this.map[modelID])
      return;
    const geometry = this.getGeometry(modelID);
    const items = this.newItemsMap(modelID, geometry);
    for (const group of geometry.groups) {
      this.fillItemsWithGroupInfo(group, geometry, items);
    }
  }

  getSubsetID(modelID, material, customID = 'DEFAULT') {
    const baseID = modelID;
    const materialID = material ? material.uuid : 'DEFAULT';
    return `${baseID} - ${materialID} - ${customID}`;
  }

  dispose() {
    Object.values(this.map).forEach(model => {
      model.indexCache = null;
      model.map = null;
    });
    this.map = null;
  }

  getGeometry(modelID) {
    const geometry = this.state.models[modelID].mesh.geometry;
    if (!geometry)
      throw new Error('Model without geometry.');
    if (!geometry.index)
      throw new Error('Geometry must be indexed');
    return geometry;
  }

  newItemsMap(modelID, geometry) {
    const startIndices = geometry.index.array;
    this.map[modelID] = {
      indexCache: startIndices.slice(0, geometry.index.array.length),
      map: new Map()
    };
    return this.map[modelID];
  }

  fillItemsWithGroupInfo(group, geometry, items) {
    let prevExpressID = -1;
    const materialIndex = group.materialIndex;
    const materialStart = group.start;
    const materialEnd = materialStart + group.count - 1;
    let objectStart = -1;
    let objectEnd = -1;
    for (let i = materialStart; i <= materialEnd; i++) {
      const index = geometry.index.array[i];
      const bufferAttr = geometry.attributes.expressID;
      const expressID = bufferAttr.array[index];
      if (prevExpressID === -1) {
        prevExpressID = expressID;
        objectStart = i;
      }
      const isEndOfMaterial = i === materialEnd;
      if (isEndOfMaterial) {
        const store = this.getMaterialStore(items.map, expressID, materialIndex);
        store.push(objectStart, materialEnd);
        break;
      }
      if (prevExpressID === expressID)
        continue;
      const store = this.getMaterialStore(items.map, prevExpressID, materialIndex);
      objectEnd = i - 1;
      store.push(objectStart, objectEnd);
      prevExpressID = expressID;
      objectStart = i;
    }
  }

  getMaterialStore(map, id, matIndex) {
    if (map.get(id) === undefined) {
      map.set(id, {});
    }
    const storedIfcItem = map.get(id);
    if (storedIfcItem === undefined)
      throw new Error('Geometry map generation error');
    if (storedIfcItem[matIndex] === undefined) {
      storedIfcItem[matIndex] = [];
    }
    return storedIfcItem[matIndex];
  }

}

class SubsetUtils {

  static getAllIndicesOfGroup(modelID, ids, materialIndex, items, flatten = true) {
    const indicesByGroup = [];
    for (const expressID of ids) {
      const entry = items.map.get(expressID);
      if (!entry)
        continue;
      const value = entry[materialIndex];
      if (!value)
        continue;
      SubsetUtils.getIndexChunk(value, indicesByGroup, materialIndex, items, flatten);
    }
    return indicesByGroup;
  }

  static getIndexChunk(value, indicesByGroup, materialIndex, items, flatten) {
    const pairs = value.length / 2;
    for (let pair = 0; pair < pairs; pair++) {
      const pairIndex = pair * 2;
      const start = value[pairIndex];
      const end = value[pairIndex + 1];
      for (let j = start; j <= end; j++) {
        if (flatten)
          indicesByGroup.push(items.indexCache[j]);
        else {
          if (!indicesByGroup[materialIndex])
            indicesByGroup[materialIndex] = [];
          indicesByGroup[materialIndex].push(items.indexCache[j]);
        }
      }
    }
  }

}

class SubsetCreator {

  constructor(state, items, subsets, BVH) {
    this.state = state;
    this.items = items;
    this.subsets = subsets;
    this.BVH = BVH;
    this.tempIndex = [];
  }

  createSubset(config, subsetID) {
    if (!this.items.map[config.modelID])
      this.items.generateGeometryIndexMap(config.modelID);
    if (!this.subsets[subsetID])
      this.initializeSubset(config, subsetID);
    this.filterIndices(config, subsetID);
    this.constructSubsetByMaterial(config, subsetID);
    config.ids.forEach(id => this.subsets[subsetID].ids.add(id));
    this.subsets[subsetID].mesh.geometry.setIndex(this.tempIndex);
    this.tempIndex.length = 0;
    const subset = this.subsets[subsetID].mesh;
    if (config.applyBVH)
      this.BVH.applyThreeMeshBVH(subset.geometry);
    if (config.scene)
      config.scene.add(subset);
    return this.subsets[subsetID].mesh;
  }

  dispose() {
    this.tempIndex = [];
  }

  initializeSubset(config, subsetID) {
    const model = this.state.models[config.modelID].mesh;
    const subsetGeom = new BufferGeometry();
    this.initializeSubsetAttributes(subsetGeom, model);
    if (!config.material)
      this.initializeSubsetGroups(subsetGeom, model);
    const mesh = new Mesh(subsetGeom, config.material || model.material);
    mesh.modelID = config.modelID;
    const bvh = Boolean(config.applyBVH);
    this.subsets[subsetID] = {
      ids: new Set(),
      mesh,
      bvh
    };
    model.add(mesh);
  }

  initializeSubsetAttributes(subsetGeom, model) {
    subsetGeom.setAttribute('position', model.geometry.attributes.position);
    subsetGeom.setAttribute('normal', model.geometry.attributes.normal);
    subsetGeom.setAttribute('expressID', model.geometry.attributes.expressID);
    subsetGeom.setIndex([]);
  }

  initializeSubsetGroups(subsetGeom, model) {
    subsetGeom.groups = JSON.parse(JSON.stringify(model.geometry.groups));
    this.resetGroups(subsetGeom);
  }

  filterIndices(config, subsetID) {
    const geometry = this.subsets[subsetID].mesh.geometry;
    if (config.removePrevious) {
      geometry.setIndex([]);
      this.resetGroups(geometry);
      return;
    }
    const previousIndices = geometry.index.array;
    const previousIDs = this.subsets[subsetID].ids;
    config.ids = config.ids.filter(id => !previousIDs.has(id));
    this.tempIndex = Array.from(previousIndices);
  }

  constructSubsetByMaterial(config, subsetID) {
    const model = this.state.models[config.modelID].mesh;
    const newIndices = {
      count: 0
    };
    for (let i = 0; i < model.geometry.groups.length; i++) {
      this.insertNewIndices(config, subsetID, i, newIndices);
    }
  }

  insertNewIndices(config, subsetID, materialIndex, newIndices) {
    const items = this.items.map[config.modelID];
    const indicesOfOneMaterial = SubsetUtils.getAllIndicesOfGroup(config.modelID, config.ids, materialIndex, items);
    if (!config.material) {
      this.insertIndicesAtGroup(subsetID, indicesOfOneMaterial, materialIndex, newIndices);
    } else {
      indicesOfOneMaterial.forEach(index => this.tempIndex.push(index));
    }
  }

  insertIndicesAtGroup(subsetID, indicesByGroup, index, newIndices) {
    const currentGroup = this.getCurrentGroup(subsetID, index);
    currentGroup.start += newIndices.count;
    let newIndicesPosition = currentGroup.start + currentGroup.count;
    newIndices.count += indicesByGroup.length;
    if (indicesByGroup.length > 0) {
      let position = newIndicesPosition;
      const start = this.tempIndex.slice(0, position);
      const end = this.tempIndex.slice(position);
      this.tempIndex = Array.prototype.concat.apply([], [start, indicesByGroup, end]);
      currentGroup.count += indicesByGroup.length;
    }
  }

  getCurrentGroup(subsetID, groupIndex) {
    const geometry = this.subsets[subsetID].mesh.geometry;
    return geometry.groups[groupIndex];
  }

  resetGroups(geometry) {
    geometry.groups.forEach((group) => {
      group.start = 0;
      group.count = 0;
    });
  }

}

class SubsetManager {

  constructor(state, BVH) {
    this.subsets = {};
    this.state = state;
    this.items = new ItemsMap(state);
    this.BVH = BVH;
    this.subsetCreator = new SubsetCreator(state, this.items, this.subsets, this.BVH);
  }

  getAllSubsets() {
    return this.subsets;
  }

  getSubset(modelID, material, customId) {
    const subsetID = this.getSubsetID(modelID, material, customId);
    return this.subsets[subsetID].mesh;
  }

  removeSubset(modelID, material, customID) {
    const subsetID = this.getSubsetID(modelID, material, customID);
    const subset = this.subsets[subsetID];
    if (!subset)
      return;
    if (subset.mesh.parent)
      subset.mesh.removeFromParent();
    subset.mesh.geometry.attributes = {};
    subset.mesh.geometry.index = null;
    subset.mesh.geometry.dispose();
    subset.mesh.geometry = null;
    delete this.subsets[subsetID];
  }

  createSubset(config) {
    const subsetID = this.getSubsetID(config.modelID, config.material, config.customID);
    return this.subsetCreator.createSubset(config, subsetID);
  }

  removeFromSubset(modelID, ids, customID, material) {
    const subsetID = this.getSubsetID(modelID, material, customID);
    if (!this.subsets[subsetID])
      return;
    const previousIDs = this.subsets[subsetID].ids;
    ids.forEach((id) => {
      if (previousIDs.has(id))
        previousIDs.delete(id);
    });
    return this.createSubset({
      modelID,
      removePrevious: true,
      material,
      customID,
      applyBVH: this.subsets[subsetID].bvh,
      ids: Array.from(previousIDs),
      scene: this.subsets[subsetID].mesh.parent
    });
  }

  clearSubset(modelID, customID, material) {
    const subsetID = this.getSubsetID(modelID, material, customID);
    if (!this.subsets[subsetID])
      return;
    this.subsets[subsetID].ids.clear();
    const subset = this.getSubset(modelID, material, customID);
    subset.geometry.setIndex([]);
  }

  dispose() {
    this.items.dispose();
    this.subsetCreator.dispose();
    Object.values(this.subsets).forEach(subset => {
      subset.ids = null;
      subset.mesh.removeFromParent();
      const mats = subset.mesh.material;
      if (Array.isArray(mats))
        mats.forEach(mat => mat.dispose());
      else
        mats.dispose();
      subset.mesh.geometry.index = null;
      subset.mesh.geometry.dispose();
      const geom = subset.mesh.geometry;
      if (geom.disposeBoundsTree)
        geom.disposeBoundsTree();
      subset.mesh = null;
    });
    this.subsets = null;
  }

  getSubsetID(modelID, material, customID = 'DEFAULT') {
    const baseID = modelID;
    const materialID = material ? material.uuid : 'DEFAULT';
    return `${baseID} - ${materialID} - ${customID}`;
  }

}

const IdAttrName = 'expressID';
const PropsNames = {
  aggregates: {
    name: IFCRELAGGREGATES,
    relating: 'RelatingObject',
    related: 'RelatedObjects',
    key: 'children'
  },
  spatial: {
    name: IFCRELCONTAINEDINSPATIALSTRUCTURE,
    relating: 'RelatingStructure',
    related: 'RelatedElements',
    key: 'children'
  },
  psets: {
    name: IFCRELDEFINESBYPROPERTIES,
    relating: 'RelatingPropertyDefinition',
    related: 'RelatedObjects',
    key: 'hasPsets'
  },
  materials: {
    name: IFCRELASSOCIATESMATERIAL,
    relating: 'RelatingMaterial',
    related: 'RelatedObjects',
    key: 'hasMaterial'
  },
  type: {
    name: IFCRELDEFINESBYTYPE,
    relating: 'RelatingType',
    related: 'RelatedObjects',
    key: 'hasType'
  }
};

class BasePropertyManager {

  constructor(state) {
    this.state = state;
  }

  async getPropertySets(modelID, elementID, recursive = false) {
    return await this.getProperty(modelID, elementID, recursive, PropsNames.psets);
  }

  async getTypeProperties(modelID, elementID, recursive = false) {
    return await this.getProperty(modelID, elementID, recursive, PropsNames.type);
  }

  async getMaterialsProperties(modelID, elementID, recursive = false) {
    return await this.getProperty(modelID, elementID, recursive, PropsNames.materials);
  }

  async getSpatialNode(modelID, node, treeChunks, includeProperties) {
    await this.getChildren(modelID, node, treeChunks, PropsNames.aggregates, includeProperties);
    await this.getChildren(modelID, node, treeChunks, PropsNames.spatial, includeProperties);
  }

  async getChildren(modelID, node, treeChunks, propNames, includeProperties) {
    const children = treeChunks[node.expressID];
    if (children == undefined)
      return;
    const prop = propNames.key;
    const nodes = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      let node = this.newNode(modelID, child);
      if (includeProperties) {
        const properties = await this.getItemProperties(modelID, node.expressID);
        node = {
          ...properties, ...node
        };
      }
      await this.getSpatialNode(modelID, node, treeChunks, includeProperties);
      nodes.push(node);
    }
    node[prop] = nodes;
  }

  newNode(modelID, id) {
    const typeName = this.getNodeType(modelID, id);
    return {
      expressID: id,
      type: typeName,
      children: []
    };
  }

  async getSpatialTreeChunks(modelID) {
    const treeChunks = {};
    await this.getChunks(modelID, treeChunks, PropsNames.aggregates);
    await this.getChunks(modelID, treeChunks, PropsNames.spatial);
    return treeChunks;
  }

  saveChunk(chunks, propNames, rel) {
    const relating = rel[propNames.relating].value;
    const related = rel[propNames.related].map((r) => r.value);
    if (chunks[relating] == undefined) {
      chunks[relating] = related;
    } else {
      chunks[relating] = chunks[relating].concat(related);
    }
  }

  getRelated(rel, propNames, IDs) {
    const element = rel[propNames.relating];
    if (!element) {
      return console.warn(`The object with ID ${rel.expressID} has a broken reference.`);
    }
    if (!Array.isArray(element))
      IDs.push(element.value);
    else
      element.forEach((ele) => IDs.push(ele.value));
  }

  static isRelated(id, rel, propNames) {
    const relatedItems = rel[propNames.related];
    if (Array.isArray(relatedItems)) {
      const values = relatedItems.map((item) => item.value);
      return values.includes(id);
    }
    return relatedItems.value === id;
  }

  static newIfcProject(id) {
    return {
      expressID: id,
      type: 'IFCPROJECT',
      children: []
    };
  }

  async getProperty(modelID, elementID, recursive = false, propName) {}

  async getChunks(modelID, chunks, propNames) {}

  async getItemProperties(modelID, expressID, recursive = false) {}

  getNodeType(modelID, id) {}

}

class WebIfcPropertyManager extends BasePropertyManager {

  async getItemProperties(modelID, id, recursive = false) {
    return this.state.api.GetLine(modelID, id, recursive);
  }

  async getHeaderLine(modelID, headerType) {
    return this.state.api.GetHeaderLine(modelID, headerType);
  }

  async getSpatialStructure(modelID, includeProperties) {
    const chunks = await this.getSpatialTreeChunks(modelID);
    const allLines = await this.state.api.GetLineIDsWithType(modelID, IFCPROJECT);
    const projectID = allLines.get(0);
    const project = WebIfcPropertyManager.newIfcProject(projectID);
    await this.getSpatialNode(modelID, project, chunks, includeProperties);
    return project;
  }

  async getAllItemsOfType(modelID, type, verbose) {
    let items = [];
    const lines = await this.state.api.GetLineIDsWithType(modelID, type);
    for (let i = 0; i < lines.size(); i++)
      items.push(lines.get(i));
    if (!verbose)
      return items;
    const result = [];
    for (let i = 0; i < items.length; i++) {
      result.push(await this.state.api.GetLine(modelID, items[i]));
    }
    return result;
  }

  async getProperty(modelID, elementID, recursive = false, propName) {
    const propSetIds = await this.getAllRelatedItemsOfType(modelID, elementID, propName);
    const result = [];
    for (let i = 0; i < propSetIds.length; i++) {
      result.push(await this.state.api.GetLine(modelID, propSetIds[i], recursive));
    }
    return result;
  }

  getNodeType(modelID, id) {
    const typeID = this.state.models[modelID].types[id];
    return this.state.api.GetNameFromTypeCode(typeID);
  }

  async getChunks(modelID, chunks, propNames) {
    const relation = await this.state.api.GetLineIDsWithType(modelID, propNames.name);
    for (let i = 0; i < relation.size(); i++) {
      const rel = await this.state.api.GetLine(modelID, relation.get(i), false);
      this.saveChunk(chunks, propNames, rel);
    }
  }

  async getAllRelatedItemsOfType(modelID, id, propNames) {
    const lines = await this.state.api.GetLineIDsWithType(modelID, propNames.name);
    const IDs = [];
    for (let i = 0; i < lines.size(); i++) {
      const rel = await this.state.api.GetLine(modelID, lines.get(i));
      const isRelated = BasePropertyManager.isRelated(id, rel, propNames);
      if (isRelated)
        this.getRelated(rel, propNames, IDs);
    }
    return IDs;
  }

}

class JSONPropertyManager extends BasePropertyManager {

  async getItemProperties(modelID, id, recursive = false) {
    return {
      ...this.state.models[modelID].jsonData[id]
    };
  }

  async getHeaderLine(modelID) {
    return {};
  }

  async getSpatialStructure(modelID, includeProperties) {
    const chunks = await this.getSpatialTreeChunks(modelID);
    const projectsIDs = await this.getAllItemsOfType(modelID, IFCPROJECT, false);
    const projectID = projectsIDs[0];
    const project = JSONPropertyManager.newIfcProject(projectID);
    await this.getSpatialNode(modelID, project, chunks, includeProperties);
    return {
      ...project
    };
  }

  async getAllItemsOfType(modelID, type, verbose) {
    const data = this.state.models[modelID].jsonData;
    const typeName = await this.state.api.GetNameFromTypeCode(type);
    if (!typeName) {
      throw new Error(`Type not found: ${type}`);
    }
    return this.filterItemsByType(data, typeName, verbose);
  }

  async getProperty(modelID, elementID, recursive = false, propName) {
    const resultIDs = await this.getAllRelatedItemsOfType(modelID, elementID, propName);
    const result = this.getItemsByID(modelID, resultIDs);
    if (recursive) {
      result.forEach(result => this.getReferencesRecursively(modelID, result));
    }
    return result;
  }

  getNodeType(modelID, id) {
    return this.state.models[modelID].jsonData[id].type;
  }

  async getChunks(modelID, chunks, propNames) {
    const relation = await this.getAllItemsOfType(modelID, propNames.name, true);
    relation.forEach(rel => {
      this.saveChunk(chunks, propNames, rel);
    });
  }

  filterItemsByType(data, typeName, verbose) {
    const result = [];
    Object.keys(data).forEach(key => {
      const numKey = parseInt(key);
      if (data[numKey].type.toUpperCase() === typeName) {
        result.push(verbose ? {
          ...data[numKey]
        } : numKey);
      }
    });
    return result;
  }

  async getAllRelatedItemsOfType(modelID, id, propNames) {
    const lines = await this.getAllItemsOfType(modelID, propNames.name, true);
    const IDs = [];
    lines.forEach(line => {
      const isRelated = JSONPropertyManager.isRelated(id, line, propNames);
      if (isRelated)
        this.getRelated(line, propNames, IDs);
    });
    return IDs;
  }

  getItemsByID(modelID, ids) {
    const data = this.state.models[modelID].jsonData;
    const result = [];
    ids.forEach(id => result.push({
      ...data[id]
    }));
    return result;
  }

  getReferencesRecursively(modelID, jsonObject) {
    if (jsonObject == undefined)
      return;
    const keys = Object.keys(jsonObject);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      this.getJSONItem(modelID, jsonObject, key);
    }
  }

  getJSONItem(modelID, jsonObject, key) {
    if (Array.isArray(jsonObject[key])) {
      return this.getMultipleJSONItems(modelID, jsonObject, key);
    }
    if (jsonObject[key] && jsonObject[key].type === 5) {
      jsonObject[key] = this.getItemsByID(modelID, [jsonObject[key].value])[0];
      this.getReferencesRecursively(modelID, jsonObject[key]);
    }
  }

  getMultipleJSONItems(modelID, jsonObject, key) {
    jsonObject[key] = jsonObject[key].map((item) => {
      if (item.type === 5) {
        item = this.getItemsByID(modelID, [item.value])[0];
        this.getReferencesRecursively(modelID, item);
      }
      return item;
    });
  }

}

const geometryTypes = new Set([
  1123145078, 574549367, 1675464909, 2059837836, 3798115385, 32440307, 3125803723, 3207858831,
  2740243338, 2624227202, 4240577450, 3615266464, 3724593414, 220341763, 477187591, 1878645084,
  1300840506, 3303107099, 1607154358, 1878645084, 846575682, 1351298697, 2417041796, 3049322572,
  3331915920, 1416205885, 776857604, 3285139300, 3958052878, 2827736869, 2732653382, 673634403,
  3448662350, 4142052618, 2924175390, 803316827, 2556980723, 1809719519, 2205249479, 807026263,
  3737207727, 1660063152, 2347385850, 3940055652, 2705031697, 3732776249, 2485617015, 2611217952,
  1704287377, 2937912522, 2770003689, 1281925730, 1484403080, 3448662350, 4142052618, 3800577675,
  4006246654, 3590301190, 1383045692, 2775532180, 2047409740, 370225590, 3593883385, 2665983363,
  4124623270, 812098782, 3649129432, 987898635, 1105321065, 3510044353, 1635779807, 2603310189,
  3406155212, 1310608509, 4261334040, 2736907675, 3649129432, 1136057603, 1260505505, 4182860854,
  2713105998, 2898889636, 59481748, 3749851601, 3486308946, 3150382593, 1062206242, 3264961684,
  15328376, 1485152156, 370225590, 1981873012, 2859738748, 45288368, 2614616156, 2732653382,
  775493141, 2147822146, 2601014836, 2629017746, 1186437898, 2367409068, 1213902940, 3632507154,
  3900360178, 476780140, 1472233963, 2804161546, 3008276851, 738692330, 374418227, 315944413,
  3905492369, 3570813810, 2571569899, 178912537, 2294589976, 1437953363, 2133299955, 572779678,
  3092502836, 388784114, 2624227202, 1425443689, 3057273783, 2347385850, 1682466193, 2519244187,
  2839578677, 3958567839, 2513912981, 2830218821, 427810014
]);

class PropertySerializer {

  constructor(webIfc) {
    this.webIfc = webIfc;
  }

  dispose() {
    this.webIfc = null;
  }

  async serializeAllProperties(modelID, maxSize, event) {
    const blobs = [];
    await this.getPropertiesAsBlobs(modelID, blobs, maxSize, event);
    return blobs;
  }

  async getPropertiesAsBlobs(modelID, blobs, maxSize, event) {
    const geometriesIDs = await this.getAllGeometriesIDs(modelID);
    let properties = await this.initializePropertiesObject(modelID);
    const allLinesIDs = await this.webIfc.GetAllLines(modelID);
    const linesCount = allLinesIDs.size();
    let lastEvent = 0.1;
    let counter = 0;
    for (let i = 0; i < linesCount; i++) {
      const id = allLinesIDs.get(i);
      if (!geometriesIDs.has(id)) {
        await this.getItemProperty(modelID, id, properties);
        counter++;
      }
      if (maxSize && counter > maxSize) {
        blobs.push(new Blob([JSON.stringify(properties)], {
          type: 'application/json'
        }));
        properties = {};
        counter = 0;
      }
      if (event && i / linesCount > lastEvent) {
        event(i, linesCount);
        lastEvent += 0.1;
      }
    }
    blobs.push(new Blob([JSON.stringify(properties)], {
      type: 'application/json'
    }));
  }

  async getItemProperty(modelID, id, properties) {
    try {
      const props = await this.webIfc.GetLine(modelID, id);
      if (props.type) {
        props.type = this.webIfc.GetNameFromTypeCode(props.type);
      }
      this.formatItemProperties(props);
      properties[id] = props;
    } catch (e) {
      console.log(`There was a problem getting the properties of the item with ID ${id}`);
    }
  }

  formatItemProperties(props) {
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value && value.value !== undefined)
        props[key] = value.value;
      else if (Array.isArray(value))
        props[key] = value.map((item) => {
          if (item && item.value)
            return item.value;
          return item;
        });
    });
  }

  async initializePropertiesObject(modelID) {
    return {
      coordinationMatrix: await this.webIfc.GetCoordinationMatrix(modelID),
      globalHeight: await this.getBuildingHeight(modelID)
    };
  }

  async getBuildingHeight(modelID) {
    const building = await this.getBuilding(modelID);
    let placement;
    const siteReference = building.ObjectPlacement.PlacementRelTo;
    if (siteReference)
      placement = siteReference.RelativePlacement.Location;
    else
      placement = building.ObjectPlacement.RelativePlacement.Location;
    const transform = placement.Coordinates.map((coord) => coord.value);
    return transform[2];
  }

  async getBuilding(modelID) {
    const allBuildingsIDs = await this.webIfc.GetLineIDsWithType(modelID, IFCBUILDING);
    const buildingID = allBuildingsIDs.get(0);
    return this.webIfc.GetLine(modelID, buildingID, true);
  }

  async getAllGeometriesIDs(modelID) {
    const geometriesIDs = new Set();
    const geomTypesArray = Array.from(geometryTypes);
    for (let i = 0; i < geomTypesArray.length; i++) {
      const category = geomTypesArray[i];
      const ids = await this.webIfc.GetLineIDsWithType(modelID, category);
      const idsSize = ids.size();
      for (let j = 0; j < idsSize; j++) {
        geometriesIDs.add(ids.get(j));
      }
    }
    return geometriesIDs;
  }

}

class PropertyManager {

  constructor(state) {
    this.state = state;
    this.webIfcProps = new WebIfcPropertyManager(state);
    this.jsonProps = new JSONPropertyManager(state);
    this.currentProps = this.webIfcProps;
    this.serializer = new PropertySerializer(this.state.api);
  }

  getExpressId(geometry, faceIndex) {
    if (!geometry.index)
      throw new Error('Geometry does not have index information.');
    const geoIndex = geometry.index.array;
    const bufferAttr = geometry.attributes[IdAttrName];
    return bufferAttr.getX(geoIndex[3 * faceIndex]);
  }

  async getHeaderLine(modelID, headerType) {
    this.updateCurrentProps();
    return this.currentProps.getHeaderLine(modelID, headerType);
  }

  async getItemProperties(modelID, elementID, recursive = false) {
    this.updateCurrentProps();
    return this.currentProps.getItemProperties(modelID, elementID, recursive);
  }

  async getAllItemsOfType(modelID, type, verbose) {
    this.updateCurrentProps();
    return this.currentProps.getAllItemsOfType(modelID, type, verbose);
  }

  async getPropertySets(modelID, elementID, recursive = false) {
    this.updateCurrentProps();
    return this.currentProps.getPropertySets(modelID, elementID, recursive);
  }

  async getTypeProperties(modelID, elementID, recursive = false) {
    this.updateCurrentProps();
    return this.currentProps.getTypeProperties(modelID, elementID, recursive);
  }

  async getMaterialsProperties(modelID, elementID, recursive = false) {
    this.updateCurrentProps();
    return this.currentProps.getMaterialsProperties(modelID, elementID, recursive);
  }

  async getSpatialStructure(modelID, includeProperties) {
    this.updateCurrentProps();
    if (!this.state.useJSON && includeProperties) {
      console.warn('Including properties in getSpatialStructure with the JSON workflow disabled can lead to poor performance.');
    }
    return await this.currentProps.getSpatialStructure(modelID, includeProperties);
  }

  updateCurrentProps() {
    this.currentProps = this.state.useJSON ? this.jsonProps : this.webIfcProps;
  }

}

class TypeManager {

  constructor(state) {
    this.state = state;
    this.state = state;
  }

  async getAllTypes(worker) {
    for (let modelID in this.state.models) {
      if (this.state.models.hasOwnProperty(modelID)) {
        const types = this.state.models[modelID].types;
        if (Object.keys(types).length == 0) {
          await this.getAllTypesOfModel(parseInt(modelID), worker);
        }
      }
    }
  }

  async getAllTypesOfModel(modelID, worker) {
    const result = {};
    const elements = await this.state.api.GetIfcEntityList(modelID);
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const lines = await this.state.api.GetLineIDsWithType(modelID, element);
      const size = lines.size();
      for (let i = 0; i < size; i++)
        result[lines.get(i)] = element;
    }
    if (this.state.worker.active && worker) {
      await worker.workerState.updateModelStateTypes(modelID, result);
    }
    this.state.models[modelID].types = result;
  }

}

class BvhManager {

  initializeMeshBVH(computeBoundsTree, disposeBoundsTree, acceleratedRaycast) {
    this.computeBoundsTree = computeBoundsTree;
    this.disposeBoundsTree = disposeBoundsTree;
    this.acceleratedRaycast = acceleratedRaycast;
    this.setupThreeMeshBVH();
  }

  applyThreeMeshBVH(geometry) {
    if (this.computeBoundsTree)
      geometry.computeBoundsTree();
  }

  setupThreeMeshBVH() {
    if (!this.computeBoundsTree || !this.disposeBoundsTree || !this.acceleratedRaycast)
      return;
    BufferGeometry.prototype.computeBoundsTree = this.computeBoundsTree;
    BufferGeometry.prototype.disposeBoundsTree = this.disposeBoundsTree;
    Mesh.prototype.raycast = this.acceleratedRaycast;
  }

}

var WorkerActions;
(function(WorkerActions) {
  WorkerActions["updateStateUseJson"] = "updateStateUseJson";
  WorkerActions["updateStateWebIfcSettings"] = "updateStateWebIfcSettings";
  WorkerActions["updateModelStateTypes"] = "updateModelStateTypes";
  WorkerActions["updateModelStateJsonData"] = "updateModelStateJsonData";
  WorkerActions["loadJsonDataFromWorker"] = "loadJsonDataFromWorker";
  WorkerActions["dispose"] = "dispose";
  WorkerActions["Close"] = "Close";
  WorkerActions["DisposeWebIfc"] = "DisposeWebIfc";
  WorkerActions["Init"] = "Init";
  WorkerActions["OpenModel"] = "OpenModel";
  WorkerActions["CreateModel"] = "CreateModel";
  WorkerActions["ExportFileAsIFC"] = "ExportFileAsIFC";
  WorkerActions["GetGeometry"] = "GetGeometry";
  WorkerActions["GetLine"] = "GetLine";
  WorkerActions["GetAndClearErrors"] = "GetAndClearErrors";
  WorkerActions["WriteLine"] = "WriteLine";
  WorkerActions["FlattenLine"] = "FlattenLine";
  WorkerActions["GetRawLineData"] = "GetRawLineData";
  WorkerActions["WriteRawLineData"] = "WriteRawLineData";
  WorkerActions["GetLineIDsWithType"] = "GetLineIDsWithType";
  WorkerActions["GetAllLines"] = "GetAllLines";
  WorkerActions["SetGeometryTransformation"] = "SetGeometryTransformation";
  WorkerActions["GetCoordinationMatrix"] = "GetCoordinationMatrix";
  WorkerActions["GetVertexArray"] = "GetVertexArray";
  WorkerActions["GetIndexArray"] = "GetIndexArray";
  WorkerActions["getSubArray"] = "getSubArray";
  WorkerActions["CloseModel"] = "CloseModel";
  WorkerActions["StreamAllMeshes"] = "StreamAllMeshes";
  WorkerActions["StreamAllMeshesWithTypes"] = "StreamAllMeshesWithTypes";
  WorkerActions["IsModelOpen"] = "IsModelOpen";
  WorkerActions["LoadAllGeometry"] = "LoadAllGeometry";
  WorkerActions["GetFlatMesh"] = "GetFlatMesh";
  WorkerActions["SetWasmPath"] = "SetWasmPath";
  WorkerActions["GetNameFromTypeCode"] = "GetNameFromTypeCode";
  WorkerActions["GetIfcEntityList"] = "GetIfcEntityList";
  WorkerActions["GetTypeCodeFromName"] = "GetTypeCodeFromName";
  WorkerActions["parse"] = "parse";
  WorkerActions["setupOptionalCategories"] = "setupOptionalCategories";
  WorkerActions["getExpressId"] = "getExpressId";
  WorkerActions["initializeProperties"] = "initializeProperties";
  WorkerActions["getAllItemsOfType"] = "getAllItemsOfType";
  WorkerActions["getItemProperties"] = "getItemProperties";
  WorkerActions["getMaterialsProperties"] = "getMaterialsProperties";
  WorkerActions["getPropertySets"] = "getPropertySets";
  WorkerActions["getSpatialStructure"] = "getSpatialStructure";
  WorkerActions["getTypeProperties"] = "getTypeProperties";
  WorkerActions["getHeaderLine"] = "getHeaderLine";
})(WorkerActions || (WorkerActions = {}));
var WorkerAPIs;
(function(WorkerAPIs) {
  WorkerAPIs["workerState"] = "workerState";
  WorkerAPIs["webIfc"] = "webIfc";
  WorkerAPIs["properties"] = "properties";
  WorkerAPIs["parser"] = "parser";
})(WorkerAPIs || (WorkerAPIs = {}));

class Vector {

  constructor(vector) {
    this._data = {};
    this._size = vector.size;
    const keys = Object.keys(vector).filter((key) => key.indexOf('size') === -1).map(key => parseInt(key));
    keys.forEach((key) => this._data[key] = vector[key]);
  }

  size() {
    return this._size;
  }

  get(index) {
    return this._data[index];
  }

}

class IfcGeometry {

  constructor(vector) {
    this._GetVertexData = vector.GetVertexData;
    this._GetVertexDataSize = vector.GetVertexDataSize;
    this._GetIndexData = vector.GetIndexData;
    this._GetIndexDataSize = vector.GetIndexDataSize;
  }

  GetVertexData() {
    return this._GetVertexData;
  }

  GetVertexDataSize() {
    return this._GetVertexDataSize;
  }

  GetIndexData() {
    return this._GetIndexData;
  }

  GetIndexDataSize() {
    return this._GetIndexDataSize;
  }

}

class FlatMesh {

  constructor(serializer, flatMesh) {
    this.expressID = flatMesh.expressID;
    this.geometries = serializer.reconstructVector(flatMesh.geometries);
  }

}

class FlatMeshVector {

  constructor(serializer, vector) {
    this._data = {};
    this._size = vector.size;
    const keys = Object.keys(vector).filter((key) => key.indexOf('size') === -1).map(key => parseInt(key));
    keys.forEach(key => this._data[key] = serializer.reconstructFlatMesh(vector[key]));
  }

  size() {
    return this._size;
  }

  get(index) {
    return this._data[index];
  }

}

class SerializedMaterial {

  constructor(material) {
    this.color = [material.color.r, material.color.g, material.color.b];
    this.opacity = material.opacity;
    this.transparent = material.transparent;
  }

}

class MaterialReconstructor {

  static new(material) {
    return new MeshLambertMaterial({
      color: new Color(material.color[0], material.color[1], material.color[2]),
      opacity: material.opacity,
      transparent: material.transparent,
      side: DoubleSide
    });
  }

}

class SerializedGeometry {

  constructor(geometry) {
    var _a,
      _b,
      _c,
      _d;
    this.position = ((_a = geometry.attributes.position) === null || _a === void 0 ? void 0 : _a.array) || [];
    this.normal = ((_b = geometry.attributes.normal) === null || _b === void 0 ? void 0 : _b.array) || [];
    this.expressID = ((_c = geometry.attributes.expressID) === null || _c === void 0 ? void 0 : _c.array) || [];
    this.index = ((_d = geometry.index) === null || _d === void 0 ? void 0 : _d.array) || [];
    this.groups = geometry.groups;
  }

}

class GeometryReconstructor {

  static new(serialized) {
    const geom = new BufferGeometry();
    GeometryReconstructor.set(geom, 'expressID', new Uint32Array(serialized.expressID), 1);
    GeometryReconstructor.set(geom, 'position', new Float32Array(serialized.position), 3);
    GeometryReconstructor.set(geom, 'normal', new Float32Array(serialized.normal), 3);
    geom.setIndex(Array. from (serialized.index));
    geom.groups = serialized.groups;
    return geom;
  }

  static set(geom, name, data, size) {
    if (data.length > 0) {
      geom.setAttribute(name, new BufferAttribute(data, size));
    }
  }

}

class SerializedMesh {

  constructor(model) {
    this.materials = [];
    this.modelID = model.modelID;
    this.geometry = new SerializedGeometry(model.geometry);
    if (Array.isArray(model.material)) {
      model.material.forEach(mat => {
        this.materials.push(new SerializedMaterial(mat));
      });
    } else {
      this.materials.push(new SerializedMaterial(model.material));
    }
  }

}

class MeshReconstructor {

  static new(serialized) {
    const model = new IFCModel();
    model.modelID = serialized.modelID;
    model.geometry = GeometryReconstructor.new(serialized.geometry);
    MeshReconstructor.getMaterials(serialized, model);
    return model;
  }

  static getMaterials(serialized, model) {
    model.material = [];
    const mats = model.material;
    serialized.materials.forEach(mat => {
      mats.push(MaterialReconstructor.new(mat));
    });
  }

}

class Serializer {

  serializeVector(vector) {
    const size = vector.size();
    const serialized = {
      size
    };
    for (let i = 0; i < size; i++) {
      serialized[i] = vector.get(i);
    }
    return serialized;
  }

  reconstructVector(vector) {
    return new Vector(vector);
  }

  serializeIfcGeometry(geometry) {
    const GetVertexData = geometry.GetVertexData();
    const GetVertexDataSize = geometry.GetVertexDataSize();
    const GetIndexData = geometry.GetIndexData();
    const GetIndexDataSize = geometry.GetIndexDataSize();
    return {
      GetVertexData,
      GetVertexDataSize,
      GetIndexData,
      GetIndexDataSize
    };
  }

  reconstructIfcGeometry(geometry) {
    return new IfcGeometry(geometry);
  }

  serializeFlatMesh(flatMesh) {
    return {
      expressID: flatMesh.expressID,
      geometries: this.serializeVector(flatMesh.geometries)
    };
  }

  reconstructFlatMesh(flatMesh) {
    return new FlatMesh(this, flatMesh);
  }

  serializeFlatMeshVector(vector) {
    const size = vector.size();
    const serialized = {
      size
    };
    for (let i = 0; i < size; i++) {
      const flatMesh = vector.get(i);
      serialized[i] = this.serializeFlatMesh(flatMesh);
    }
    return serialized;
  }

  reconstructFlatMeshVector(vector) {
    return new FlatMeshVector(this, vector);
  }

  serializeIfcModel(model) {
    return new SerializedMesh(model);
  }

  reconstructIfcModel(model) {
    return MeshReconstructor.new(model);
  }

}

class PropertyHandler {

  constructor(handler) {
    this.handler = handler;
    this.API = WorkerAPIs.properties;
  }

  getExpressId(geometry, faceIndex) {
    if (!geometry.index)
      throw new Error('Geometry does not have index information.');
    const geoIndex = geometry.index.array;
    const bufferAttr = geometry.attributes[IdAttrName];
    return bufferAttr.getX(geoIndex[3 * faceIndex]);
  }

  getHeaderLine(modelID, headerType) {
    return this.handler.request(this.API, WorkerActions.getHeaderLine, {
      modelID,
      headerType
    });
  }

  getAllItemsOfType(modelID, type, verbose) {
    return this.handler.request(this.API, WorkerActions.getAllItemsOfType, {
      modelID,
      type,
      verbose
    });
  }

  getItemProperties(modelID, elementID, recursive) {
    return this.handler.request(this.API, WorkerActions.getItemProperties, {
      modelID,
      elementID,
      recursive
    });
  }

  getMaterialsProperties(modelID, elementID, recursive) {
    return this.handler.request(this.API, WorkerActions.getMaterialsProperties, {
      modelID,
      elementID,
      recursive
    });
  }

  getPropertySets(modelID, elementID, recursive) {
    return this.handler.request(this.API, WorkerActions.getPropertySets, {
      modelID,
      elementID,
      recursive
    });
  }

  getTypeProperties(modelID, elementID, recursive) {
    return this.handler.request(this.API, WorkerActions.getTypeProperties, {
      modelID,
      elementID,
      recursive
    });
  }

  getSpatialStructure(modelID, includeProperties) {
    return this.handler.request(this.API, WorkerActions.getSpatialStructure, {
      modelID,
      includeProperties
    });
  }

}

class WebIfcHandler {

  constructor(handler, serializer) {
    this.handler = handler;
    this.serializer = serializer;
    this.API = WorkerAPIs.webIfc;
  }

  async Init() {
    this.wasmModule = true;
    return this.handler.request(this.API, WorkerActions.Init);
  }

  async OpenModel(data, settings) {
    return this.handler.request(this.API, WorkerActions.OpenModel, {
      data,
      settings
    });
  }

  async CreateModel(model, settings) {
    return this.handler.request(this.API, WorkerActions.CreateModel, {
      model,
      settings
    });
  }

  async ExportFileAsIFC(modelID) {
    return this.handler.request(this.API, WorkerActions.ExportFileAsIFC, {
      modelID
    });
  }

  async GetHeaderLine(modelID, headerType) {
    return this.handler.request(this.API, WorkerActions.getHeaderLine, {
      modelID,
      headerType
    });
  }

  async GetGeometry(modelID, geometryExpressID) {
    this.handler.serializeHandlers[this.handler.requestID] = (geom) => {
      return this.serializer.reconstructIfcGeometry(geom);
    };
    return this.handler.request(this.API, WorkerActions.GetGeometry, {
      modelID,
      geometryExpressID
    });
  }

  async GetLine(modelID, expressID, flatten) {
    return this.handler.request(this.API, WorkerActions.GetLine, {
      modelID,
      expressID,
      flatten
    });
  }

  async GetAndClearErrors(modelID) {
    this.handler.serializeHandlers[this.handler.requestID] = (vector) => {
      return this.serializer.reconstructVector(vector);
    };
    return this.handler.request(this.API, WorkerActions.GetAndClearErrors, {
      modelID
    });
  }

  async GetNameFromTypeCode(type) {
    return this.handler.request(this.API, WorkerActions.GetNameFromTypeCode, {
      type
    });
  }

  async GetIfcEntityList(modelID) {
    return this.handler.request(this.API, WorkerActions.GetIfcEntityList, {
      modelID
    });
  }

  async GetTypeCodeFromName(modelID, typeName) {
    return this.handler.request(this.API, WorkerActions.GetTypeCodeFromName, {
      modelID,
      typeName
    });
  }

  async WriteLine(modelID, lineObject) {
    return this.handler.request(this.API, WorkerActions.WriteLine, {
      modelID,
      lineObject
    });
  }

  async FlattenLine(modelID, line) {
    return this.handler.request(this.API, WorkerActions.FlattenLine, {
      modelID,
      line
    });
  }

  async GetRawLineData(modelID, expressID) {
    return this.handler.request(this.API, WorkerActions.GetRawLineData, {
      modelID,
      expressID
    });
  }

  async WriteRawLineData(modelID, data) {
    return this.handler.request(this.API, WorkerActions.WriteRawLineData, {
      modelID,
      data
    });
  }

  async GetLineIDsWithType(modelID, type) {
    this.handler.serializeHandlers[this.handler.requestID] = (vector) => {
      return this.serializer.reconstructVector(vector);
    };
    return this.handler.request(this.API, WorkerActions.GetLineIDsWithType, {
      modelID,
      type
    });
  }

  async GetAllLines(modelID) {
    this.handler.serializeHandlers[this.handler.requestID] = (vector) => {
      return this.serializer.reconstructVector(vector);
    };
    return this.handler.request(this.API, WorkerActions.GetAllLines, {
      modelID
    });
  }

  async SetGeometryTransformation(modelID, transformationMatrix) {
    return this.handler.request(this.API, WorkerActions.SetGeometryTransformation, {
      modelID,
      transformationMatrix
    });
  }

  async GetCoordinationMatrix(modelID) {
    return this.handler.request(this.API, WorkerActions.GetCoordinationMatrix, {
      modelID
    });
  }

  async GetVertexArray(ptr, size) {
    return this.handler.request(this.API, WorkerActions.GetVertexArray, {
      ptr,
      size
    });
  }

  async GetIndexArray(ptr, size) {
    return this.handler.request(this.API, WorkerActions.GetIndexArray, {
      ptr,
      size
    });
  }

  async getSubArray(heap, startPtr, sizeBytes) {
    return this.handler.request(this.API, WorkerActions.getSubArray, {
      heap,
      startPtr,
      sizeBytes
    });
  }

  async CloseModel(modelID) {
    return this.handler.request(this.API, WorkerActions.CloseModel, {
      modelID
    });
  }

  async StreamAllMeshes(modelID, meshCallback) {
    this.handler.callbackHandlers[this.handler.requestID] = {
      action: meshCallback,
      serializer: this.serializer.reconstructFlatMesh
    };
    return this.handler.request(this.API, WorkerActions.StreamAllMeshes, {
      modelID
    });
  }

  async StreamAllMeshesWithTypes(modelID, types, meshCallback) {
    this.handler.callbackHandlers[this.handler.requestID] = {
      action: meshCallback,
      serializer: this.serializer.reconstructFlatMesh
    };
    return this.handler.request(this.API, WorkerActions.StreamAllMeshesWithTypes, {
      modelID,
      types
    });
  }

  async IsModelOpen(modelID) {
    return this.handler.request(this.API, WorkerActions.IsModelOpen, {
      modelID
    });
  }

  async LoadAllGeometry(modelID) {
    this.handler.serializeHandlers[this.handler.requestID] = (vector) => {
      return this.serializer.reconstructFlatMeshVector(vector);
    };
    return this.handler.request(this.API, WorkerActions.LoadAllGeometry, {
      modelID
    });
  }

  async GetFlatMesh(modelID, expressID) {
    this.handler.serializeHandlers[this.handler.requestID] = (flatMesh) => {
      return this.serializer.reconstructFlatMesh(flatMesh);
    };
    return this.handler.request(this.API, WorkerActions.GetFlatMesh, {
      modelID,
      expressID
    });
  }

  async SetWasmPath(path) {
    return this.handler.request(this.API, WorkerActions.SetWasmPath, {
      path
    });
  }

}

class WorkerStateHandler {

  constructor(handler) {
    this.handler = handler;
    this.API = WorkerAPIs.workerState;
    this.state = this.handler.state;
  }

  async updateStateUseJson() {
    const useJson = this.state.useJSON;
    return this.handler.request(this.API, WorkerActions.updateStateUseJson, {
      useJson
    });
  }

  async updateStateWebIfcSettings() {
    const webIfcSettings = this.state.webIfcSettings;
    return this.handler.request(this.API, WorkerActions.updateStateWebIfcSettings, {
      webIfcSettings
    });
  }

  async updateModelStateTypes(modelID, types) {
    return this.handler.request(this.API, WorkerActions.updateModelStateTypes, {
      modelID,
      types
    });
  }

  async updateModelStateJsonData(modelID, jsonData) {
    return this.handler.request(this.API, WorkerActions.updateModelStateJsonData, {
      modelID,
      jsonData
    });
  }

  async loadJsonDataFromWorker(modelID, path) {
    return this.handler.request(this.API, WorkerActions.loadJsonDataFromWorker, {
      modelID,
      path
    });
  }

}

var DBOperation;
(function(DBOperation) {
  DBOperation[DBOperation["transferIfcModel"] = 0] = "transferIfcModel";
  DBOperation[DBOperation["transferIndividualItems"] = 1] = "transferIndividualItems";
})(DBOperation || (DBOperation = {}));

class IndexedDatabase {

  async save(item, id) {
    const open = IndexedDatabase.openOrCreateDB(id);
    this.createSchema(open, id);
    return new Promise((resolve, reject) => {
      open.onsuccess = () => this.saveItem(item, open, id, resolve);
    });
  }

  async load(id) {
    const open = IndexedDatabase.openOrCreateDB(id);
    return new Promise((resolve, reject) => {
      open.onsuccess = () => this.loadItem(open, id, resolve);
    });
  }

  createSchema(open, id) {
    open.onupgradeneeded = function() {
      const db = open.result;
      db.createObjectStore(id.toString(), {
        keyPath: "id"
      });
    };
  }

  saveItem(item, open, id, resolve) {
    const {db, tx, store} = IndexedDatabase.getDBItems(open, id);
    item.id = id;
    store.put(item);
    tx.oncomplete = () => IndexedDatabase.closeDB(db, tx, resolve);
  }

  loadItem(open, id, resolve) {
    const {db, tx, store} = IndexedDatabase.getDBItems(open, id);
    const item = store.get(id);
    const callback = () => {
      delete item.result.id;
      resolve(item.result);
    };
    tx.oncomplete = () => IndexedDatabase.closeDB(db, tx, callback);
  }

  static getDBItems(open, id) {
    const db = open.result;
    const tx = db.transaction(id.toString(), "readwrite");
    const store = tx.objectStore(id.toString());
    return {
      db,
      tx,
      store
    };
  }

  static openOrCreateDB(id) {
    return indexedDB.open(id.toString(), 1);
  }

  static closeDB(db, tx, resolve) {
    db.close();
    resolve("success");
  }

}

class ParserHandler {

  constructor(handler, serializer, BVH, IDB) {
    this.handler = handler;
    this.serializer = serializer;
    this.BVH = BVH;
    this.IDB = IDB;
    this.optionalCategories = {
      [IFCSPACE]: true,
      [IFCOPENINGELEMENT]: false
    };
    this.API = WorkerAPIs.parser;
  }

  async setupOptionalCategories(config) {
    this.optionalCategories = config;
    return this.handler.request(this.API, WorkerActions.setupOptionalCategories, {
      config
    });
  }

  async parse(buffer, coordinationMatrix) {
    this.handler.onprogressHandlers[this.handler.requestID] = (progress) => {
      if (this.handler.state.onProgress)
        this.handler.state.onProgress(progress);
    };
    this.handler.serializeHandlers[this.handler.requestID] = async (result) => {
      this.updateState(result.modelID);
      return this.getModel();
    };
    return this.handler.request(this.API, WorkerActions.parse, {
      buffer,
      coordinationMatrix
    });
  }

  getAndClearErrors(_modelId) {}

  updateState(modelID) {
    this.handler.state.models[modelID] = {
      modelID: modelID,
      mesh: {},
      types: {},
      jsonData: {}
    };
  }

  async getModel() {
    const serializedModel = await this.IDB.load(DBOperation.transferIfcModel);
    const model = this.serializer.reconstructIfcModel(serializedModel);
    this.BVH.applyThreeMeshBVH(model.geometry);
    this.handler.state.models[model.modelID].mesh = model;
    return model;
  }

}

class IFCWorkerHandler {

  constructor(state, BVH) {
    this.state = state;
    this.BVH = BVH;
    this.requestID = 0;
    this.rejectHandlers = {};
    this.resolveHandlers = {};
    this.serializeHandlers = {};
    this.callbackHandlers = {};
    this.onprogressHandlers = {};
    this.serializer = new Serializer();
    this.IDB = new IndexedDatabase();
    this.workerPath = this.state.worker.path;
    this.ifcWorker = new Worker(this.workerPath);
    this.ifcWorker.onmessage = (data) => this.handleResponse(data);
    this.properties = new PropertyHandler(this);
    this.parser = new ParserHandler(this, this.serializer, this.BVH, this.IDB);
    this.webIfc = new WebIfcHandler(this, this.serializer);
    this.workerState = new WorkerStateHandler(this);
  }

  request(worker, action, args) {
    const data = {
      worker,
      action,
      args,
      id: this.requestID,
      result: undefined,
      onProgress: false
    };
    return new Promise((resolve, reject) => {
      this.resolveHandlers[this.requestID] = resolve;
      this.rejectHandlers[this.requestID] = reject;
      this.requestID++;
      this.ifcWorker.postMessage(data);
    });
  }

  async terminate() {
    await this.request(WorkerAPIs.workerState, WorkerActions.dispose);
    await this.request(WorkerAPIs.webIfc, WorkerActions.DisposeWebIfc);
    this.ifcWorker.terminate();
  }

  async Close() {
    await this.request(WorkerAPIs.webIfc, WorkerActions.Close);
  }

  handleResponse(event) {
    const data = event.data;
    if (data.onProgress) {
      this.resolveOnProgress(data);
      return;
    }
    this.callHandlers(data);
    delete this.resolveHandlers[data.id];
    delete this.rejectHandlers[data.id];
    delete this.onprogressHandlers[data.id];
  }

  callHandlers(data) {
    try {
      this.resolveSerializations(data);
      this.resolveCallbacks(data);
      this.resolveHandlers[data.id](data.result);
    } catch (error) {
      this.rejectHandlers[data.id](error);
    }
  }

  resolveOnProgress(data) {
    if (this.onprogressHandlers[data.id]) {
      data.result = this.onprogressHandlers[data.id](data.result);
    }
  }

  resolveSerializations(data) {
    if (this.serializeHandlers[data.id]) {
      data.result = this.serializeHandlers[data.id](data.result);
      delete this.serializeHandlers[data.id];
    }
  }

  resolveCallbacks(data) {
    if (this.callbackHandlers[data.id]) {
      let callbackParameter = data.result;
      if (this.callbackHandlers[data.id].serializer) {
        callbackParameter = this.callbackHandlers[data.id].serializer(data.result);
      }
      this.callbackHandlers[data.id].action(callbackParameter);
    }
  }

}

class MemoryCleaner {

  constructor(state) {
    this.state = state;
  }

  async dispose() {
    Object.keys(this.state.models).forEach(modelID => {
      const model = this.state.models[parseInt(modelID, 10)];
      model.mesh.removeFromParent();
      const geom = model.mesh.geometry;
      if (geom.disposeBoundsTree)
        geom.disposeBoundsTree();
      geom.dispose();
      if (!Array.isArray(model.mesh.material))
        model.mesh.material.dispose();
      else
        model.mesh.material.forEach(mat => mat.dispose());
      model.mesh = null;
      model.types = null;
      model.jsonData = null;
    });
    this.state.api = null;
    this.state.models = null;
  }

}

class IFCUtils {

  constructor(state) {
    this.state = state;
    this.map = {};
  }

  isA(entity, entity_class) {
    var test = false;
    if (entity_class) {
      if (this.state.api.GetNameFromTypeCode(entity.type) === entity_class.toUpperCase()) {
        test = true;
      }
      return test;
    } else {
      return this.state.api.GetNameFromTypeCode(entity.type);
    }
  }

  async byId(modelID, id) {
    return this.state.api.GetLine(modelID, id);
  }

  async idsByType(modelID, entity_class) {
    let entities_ids = await this.state.api.GetLineIDsWithType(modelID, Number(this.state.api.GetTypeCodeFromName(modelID, entity_class.toUpperCase())));
    return entities_ids;
  }

  async byType(modelID, entity_class) {
    let entities_ids = await this.idsByType(modelID, entity_class);
    if (entities_ids !== null) {
      let items = [];
      for (let i = 0; i < entities_ids.size(); i++) {
        let entity = await this.byId(modelID, entities_ids.get(i));
        items.push(entity);
      }
      return items;
    }
  }

}

class Data {

  constructor(state) {
    this.state = state;
    this.isLoaded = false;
    this.workPlans = {};
    this.workSchedules = {};
    this.workCalendars = {};
    this.workTimes = {};
    this.recurrencePatterns = {};
    this.timePeriods = {};
    this.tasks = {};
    this.taskTimes = {};
    this.lagTimes = {};
    this.sequences = {};
    this.utils = new IFCUtils(this.state);
  }

  async load(modelID) {
    await this.loadTasks(modelID);
    await this.loadWorkSchedules(modelID);
    await this.loadWorkCalendars(modelID);
    await this.loadWorkTimes(modelID);
    await this.loadTimePeriods(modelID);
    this.isLoaded = true;
  }

  async loadWorkSchedules(modelID) {
    let workSchedules = await this.utils.byType(modelID, "IfcWorkSchedule");
    for (let i = 0; i < workSchedules.length; i++) {
      let workSchedule = workSchedules[i];
      this.workSchedules[workSchedule.expressID] = {
        "Id": workSchedule.expressID,
        "Name": workSchedule.Name.value,
        "Description": ((workSchedule.Description) ? workSchedule.Description.value : ""),
        "Creators": [],
        "CreationDate": ((workSchedule.CreationDate) ? workSchedule.CreationDate.value : ""),
        "StartTime": ((workSchedule.StartTime) ? workSchedule.StartTime.value : ""),
        "FinishTime": ((workSchedule.FinishTime) ? workSchedule.FinishTime.value : ""),
        "TotalFloat": ((workSchedule.TotalFloat) ? workSchedule.TotalFloat.value : ""),
        "RelatedObjects": [],
      };
    }
    this.loadWorkScheduleRelatedObjects(modelID);
  }

  async loadWorkScheduleRelatedObjects(modelID) {
    let relsControls = await this.utils.byType(modelID, "IfcRelAssignsToControl");
    for (let i = 0; i < relsControls.length; i++) {
      let relControls = relsControls[i];
      let relatingControl = await this.utils.byId(modelID, relControls.RelatingControl.value);
      let relatedObjects = relControls.RelatedObjects;
      if (this.utils.isA(relatingControl, "IfcWorkSchedule")) {
        for (var objectIndex = 0; objectIndex < relatedObjects.length; objectIndex++) {
          this.workSchedules[relatingControl.expressID]["RelatedObjects"].push(relatedObjects[objectIndex].value);
        }
      }
    }
  }

  async loadTasks(modelID) {
    let tasks = await this.utils.byType(modelID, "IfcTask");
    for (let i = 0; i < tasks.length; i++) {
      let task = tasks[i];
      this.tasks[task.expressID] = {
        "Id": task.expressID,
        "Name": ((task.Name) ? task.Name.value : ""),
        "PredefinedType": ((task.PredefinedType) ? task.PredefinedType.value : ""),
        "TaskTime": ((task.TaskTime) ? await this.utils.byId(modelID, task.TaskTime.value) : ""),
        "Identification": ((task.Identification) ? task.Identification.value : ""),
        "IsMilestone": ((task.IsMilestone) ? task.IsMilestone.value : ""),
        "IsPredecessorTo": [],
        "IsSucessorFrom": [],
        "Inputs": [],
        "Resources": [],
        "Outputs": [],
        "Controls": [],
        "Nests": [],
        "IsNestedBy": [],
        "OperatesOn": [],
        "HasAssignmentsWorkCalendars": [],
      };
    }
    await this.loadTaskSequence(modelID);
    await this.loadTaskOutputs(modelID);
    await this.loadTaskNesting(modelID);
    await this.loadTaskOperations(modelID);
    await this.loadAssignementsWorkCalendar(modelID);
  }

  async loadTaskSequence(modelID) {
    let relsSequence = await this.utils.idsByType(modelID, "IfcRelSequence");
    for (let i = 0; i < relsSequence.size(); i++) {
      let relSequenceId = relsSequence.get(i);
      if (relSequenceId !== 0) {
        let relSequence = await this.utils.byId(modelID, relSequenceId);
        let related_process = relSequence.RelatedProcess.value;
        let relatingProcess = relSequence.RelatingProcess.value;
        this.tasks[relatingProcess]["IsPredecessorTo"].push(relSequence.expressID);
        this.tasks[related_process]["IsSucessorFrom"].push(relSequence.expressID);
      }
    }
  }

  async loadTaskOutputs(modelID) {
    let rels_assigns_to_product = await this.utils.byType(modelID, "IfcRelAssignsToProduct");
    for (let i = 0; i < rels_assigns_to_product.length; i++) {
      let relAssignsToProduct = rels_assigns_to_product[i];
      let relatedObject = await this.utils.byId(modelID, relAssignsToProduct.RelatedObjects[0].value);
      if (this.utils.isA(relatedObject, "IfcTask")) {
        let relatingProduct = await this.utils.byId(modelID, relAssignsToProduct.RelatingProduct.value);
        this.tasks[relatedObject.expressID]["Outputs"].push(relatingProduct.expressID);
      }
    }
  }

  async loadTaskNesting(modelID) {
    let rels_nests = await this.utils.byType(modelID, "IfcRelNests");
    for (let i = 0; i < rels_nests.length; i++) {
      let relNests = rels_nests[i];
      let relating_object = await this.utils.byId(modelID, relNests.RelatingObject.value);
      if (this.utils.isA(relating_object, "IfcTask")) {
        let relatedObjects = relNests.RelatedObjects;
        for (var object_index = 0; object_index < relatedObjects.length; object_index++) {
          this.tasks[relating_object.expressID]["IsNestedBy"].push(relatedObjects[object_index].value);
          this.tasks[relatedObjects[object_index].value]["Nests"].push(relating_object.expressID);
        }
      }
    }
  }

  async loadTaskOperations(modelID) {
    let relsAssignsToProcess = await this.utils.byType(modelID, "IfcRelAssignsToProcess");
    for (let i = 0; i < relsAssignsToProcess.length; i++) {
      let relAssignToProcess = relsAssignsToProcess[i];
      let relatingProcess = await this.utils.byId(modelID, relAssignToProcess.RelatingProcess.value);
      if (this.utils.isA(relatingProcess, "IfcTask")) {
        let relatedObjects = relAssignToProcess.RelatedObjects;
        for (var object_index = 0; object_index < relatedObjects.length; object_index++) {
          this.tasks[relatingProcess.expressID]["OperatesOn"].push(relatedObjects[object_index].value);
        }
      }
    }
  }

  async loadAssignementsWorkCalendar(modelID) {
    let relsAssignsToControl = await this.utils.byType(modelID, "IfcRelAssignsToControl");
    for (let i = 0; i < relsAssignsToControl.length; i++) {
      let relAssignsToControl = relsAssignsToControl[i];
      let relatingControl = await this.utils.byId(modelID, relAssignsToControl.RelatingControl.value);
      if (this.utils.isA(relatingControl, "IfcWorkCalendar")) {
        let relatedObjects = relAssignsToControl.RelatedObjects;
        for (var object_index = 0; object_index < relatedObjects.length; object_index++) {
          this.tasks[relatedObjects[object_index].value]["HasAssignmentsWorkCalendars"].push(relatingControl.expressID);
        }
      }
    }
  }

  async loadWorkCalendars(modelID) {
    let workCalendars = await this.utils.byType(modelID, "IfcWorkCalendar");
    for (let i = 0; i < workCalendars.length; i++) {
      let workCalendar = workCalendars[i];
      let workCalenderData = {
        "Id": workCalendar.expressID,
        "Name": ((workCalendar.Name) ? workCalendar.Name.value : ""),
        "Description": ((workCalendar.Description) ? workCalendar.Description.value : ""),
        "WorkingTimes": ((workCalendar.WorkingTimes) ? workCalendar.WorkingTimes : []),
        "ExceptionTimes": ((workCalendar.ExceptionTimes) ? workCalendar.ExceptionTimes : []),
      };
      this.workCalendars[workCalendar.expressID] = workCalenderData;
    }
  }

  async loadWorkTimes(modelID) {
    let workTimes = await this.utils.byType(modelID, "IfcWorkTime");
    for (let i = 0; i < workTimes.length; i++) {
      let workTime = workTimes[i];
      let workTimeData = {
        "Name": ((workTime.Name) ? workTime.Name.value : ""),
        "RecurrencePattern": ((workTime.RecurrencePattern) ? await this.utils.byId(modelID, workTime.RecurrencePattern.value) : ""),
        "Start": ((workTime.Start) ? new Date(workTime.Start.value) : ""),
        "Finish": ((workTime.Finish) ? new Date(workTime.Finish.value) : ""),
      };
      this.workTimes[workTime.expressID] = workTimeData;
    }
  }

  async loadTimePeriods(modelID) {
    let timePeriods = await this.utils.byType(modelID, "IfcTimePeriod");
    for (let i = 0; i < timePeriods.length; i++) {
      let timePeriod = timePeriods[i];
      let workTimeData = {
        "StartTime": ((timePeriod.StartTime) ? new Date(timePeriod.StartTime.value) : ""),
        "EndTime": ((timePeriod.EndTime) ? new Date(timePeriod.EndTime.value) : ""),
      };
      this.timePeriods[timePeriod.expressID] = workTimeData;
    }
  }

}

class IFCManager {

  constructor() {
    this.state = {
      models: [],
      api: new WebIFC.IfcAPI(),
      useJSON: false,
      worker: {
        active: false,
        path: ''
      }
    };
    this.BVH = new BvhManager();
    this.parser = new IFCParser(this.state, this.BVH);
    this.subsets = new SubsetManager(this.state, this.BVH);
    this.utils = new IFCUtils(this.state);
    this.sequenceData = new Data(this.state);
    this.properties = new PropertyManager(this.state);
    this.types = new TypeManager(this.state);
    this.useFragments = false;
    this.cleaner = new MemoryCleaner(this.state);
  }

  get ifcAPI() {
    return this.state.api;
  }

  async parse(buffer) {
    var _a;
    let model = await this.parser.parse(buffer, (_a = this.state.coordinationMatrix) === null || _a === void 0 ? void 0 : _a.toArray());
    model.setIFCManager(this);
    try {
      await this.types.getAllTypes(this.worker);
    } catch (e) {
      console.log("Could not get all types of model.");
    }
    return model;
  }

  async setWasmPath(path) {
    this.state.api.SetWasmPath(path);
    this.state.wasmPath = path;
  }

  setupThreeMeshBVH(computeBoundsTree, disposeBoundsTree, acceleratedRaycast) {
    this.BVH.initializeMeshBVH(computeBoundsTree, disposeBoundsTree, acceleratedRaycast);
  }

  setOnProgress(onProgress) {
    this.state.onProgress = onProgress;
  }

  setupCoordinationMatrix(matrix) {
    this.state.coordinationMatrix = matrix;
  }

  clearCoordinationMatrix() {
    delete this.state.coordinationMatrix;
  }

  async applyWebIfcConfig(settings) {
    this.state.webIfcSettings = settings;
    if (this.state.worker.active && this.worker) {
      await this.worker.workerState.updateStateWebIfcSettings();
    }
  }

  async useWebWorkers(active, path) {
    if (this.state.worker.active === active)
      return;
    this.state.api = null;
    if (active) {
      if (!path)
        throw new Error('You must provide a path to the web worker.');
      this.state.worker.active = active;
      this.state.worker.path = path;
      await this.initializeWorkers();
      const wasm = this.state.wasmPath;
      if (wasm)
        await this.setWasmPath(wasm);
    } else {
      this.state.api = new WebIFC.IfcAPI();
    }
  }

  async useJSONData(useJSON = true) {
    var _a;
    this.state.useJSON = useJSON;
    if (useJSON) {
      await ((_a = this.worker) === null || _a === void 0 ? void 0 : _a.workerState.updateStateUseJson());
    }
  }

  async addModelJSONData(modelID, data) {
    var _a;
    const model = this.state.models[modelID];
    if (!model)
      throw new Error('The specified model for the JSON data does not exist');
    if (this.state.worker.active) {
      await ((_a = this.worker) === null || _a === void 0 ? void 0 : _a.workerState.updateModelStateJsonData(modelID, data));
    } else {
      model.jsonData = data;
    }
  }

  async loadJsonDataFromWorker(modelID, path) {
    var _a;
    if (this.state.worker.active) {
      await ((_a = this.worker) === null || _a === void 0 ? void 0 : _a.workerState.loadJsonDataFromWorker(modelID, path));
    }
  }

  close(modelID, scene) {
    try {
      this.state.api.CloseModel(modelID);
      const mesh = this.state.models[modelID].mesh;
      const {geometry, material} = mesh;
      if (scene)
        scene.remove(mesh);
      geometry === null || geometry === void 0 ? void 0 : geometry.dispose();
      Array.isArray(material) ? material.forEach(m => m.dispose()) : material === null || material === void 0 ? void 0 : material.dispose();
      delete this.state.models[modelID];
    } catch (e) {
      console.warn(`Close IFCModel ${modelID} failed`);
    }
  }

  getExpressId(geometry, faceIndex) {
    return this.properties.getExpressId(geometry, faceIndex);
  }

  getAllItemsOfType(modelID, type, verbose) {
    return this.properties.getAllItemsOfType(modelID, type, verbose);
  }

  getItemProperties(modelID, id, recursive = false) {
    return this.properties.getItemProperties(modelID, id, recursive);
  }

  getPropertySets(modelID, id, recursive = false) {
    return this.properties.getPropertySets(modelID, id, recursive);
  }

  getTypeProperties(modelID, id, recursive = false) {
    return this.properties.getTypeProperties(modelID, id, recursive);
  }

  getMaterialsProperties(modelID, id, recursive = false) {
    return this.properties.getMaterialsProperties(modelID, id, recursive);
  }

  getIfcType(modelID, id) {
    const typeID = this.state.models[modelID].types[id];
    return this.state.api.GetNameFromTypeCode(typeID);
  }

  getSpatialStructure(modelID, includeProperties) {
    return this.properties.getSpatialStructure(modelID, includeProperties);
  }

  getSubset(modelID, material, customId) {
    return this.subsets.getSubset(modelID, material, customId);
  }

  removeSubset(modelID, material, customID) {
    this.subsets.removeSubset(modelID, material, customID);
  }

  createSubset(config) {
    return this.subsets.createSubset(config);
  }

  removeFromSubset(modelID, ids, customID, material) {
    return this.subsets.removeFromSubset(modelID, ids, customID, material);
  }

  clearSubset(modelID, customID, material) {
    return this.subsets.clearSubset(modelID, customID, material);
  }

  async isA(entity, entity_class) {
    return this.utils.isA(entity, entity_class);
  }

  async getSequenceData(modelID) {
    await this.sequenceData.load(modelID);
    return this.sequenceData;
  }

  async byType(modelID, entityClass) {
    return this.utils.byType(modelID, entityClass);
  }

  async byId(modelID, id) {
    return this.utils.byId(modelID, id);
  }

  async idsByType(modelID, entityClass) {
    return this.utils.idsByType(modelID, entityClass);
  }

  async dispose() {
    IFCModel.dispose();
    await this.cleaner.dispose();
    this.subsets.dispose();
    if (this.worker && this.state.worker.active)
      await this.worker.terminate();
    this.state = null;
  }

  async disposeMemory() {
    var _a;
    if (this.state.worker.active) {
      await ((_a = this.worker) === null || _a === void 0 ? void 0 : _a.Close());
    } else {
      this.state.api.Close();
      this.state.api = null;
      this.state.api = new WebIFC.IfcAPI();
    }
  }

  getAndClearErrors(modelID) {
    return this.parser.getAndClearErrors(modelID);
  }

  async initializeWorkers() {
    this.worker = new IFCWorkerHandler(this.state, this.BVH);
    this.state.api = this.worker.webIfc;
    this.properties = this.worker.properties;
    await this.worker.parser.setupOptionalCategories(this.parser.optionalCategories);
    this.parser = this.worker.parser;
    await this.worker.workerState.updateStateUseJson();
    await this.worker.workerState.updateStateWebIfcSettings();
  }

}

class IFCLoader extends Loader {

  constructor(manager) {
    super(manager);
    this.ifcManager = new IFCManager();
  }

  load(url, onLoad, onProgress, onError) {
    const scope = this;
    const loader = new FileLoader(scope.manager);
    this.onProgress = onProgress;
    loader.setPath(scope.path);
    loader.setResponseType('arraybuffer');
    loader.setRequestHeader(scope.requestHeader);
    loader.setWithCredentials(scope.withCredentials);
    loader.load(url, async function (buffer) {
      try {
        if (typeof buffer == 'string') {
          throw new Error('IFC files must be given as a buffer!');
        }
        onLoad(await scope.parse(buffer));
      } catch (e) {
        if (onError) {
          onError(e);
        } else {
          console.error(e);
        }
        scope.manager.itemError(url);
      }
    }, onProgress, onError);
  }

  parse(buffer) {
    return this.ifcManager.parse(buffer);
  }

}

export { IFCLoader };
//# sourceMappingURL=IFCLoader.js.map
