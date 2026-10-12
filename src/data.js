import { browserWorkspace } from './firebase';
import * as cloud from './cloud-data.js';
import * as browser from './browser-data.js';

const data = browserWorkspace ? browser : cloud;
export const { collectionNames, watchAccount, createFarm, createPlot, updateFarm, updatePlot,
  archiveFarm, archivePlot, createObservation, createTask, setTaskCompleted, saveScan,
  shareScan, revokeScan, deleteScan, deleteAccount, linkImportedScan, importLegacyHistory,
  fetchPrivateImage, cleanupUnsavedScan } = data;
export const { userCollection, userDocument } = cloud;
