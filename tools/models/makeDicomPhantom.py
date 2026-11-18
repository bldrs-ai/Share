"""Write the synthetic CT series under testdata/models/dicom/.

A phantom (an air-filled box around a soft-tissue ellipsoid with a bone
shell and a dense sphere off-centre in +column) as uncompressed DICOM slices,
written by pydicom — a writer independent of Share's reader — and zipped the
way scanner exports arrive: extension-less slice files in shuffled order, a
one-slice scout series beside the scan, and a README.

    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install pydicom numpy
    /tmp/venv/bin/python tools/models/makeDicomPhantom.py

UIDs are derived from fixed entropy, so a re-run writes the same zips.
See tools/models/README.md.
"""
import io, os, random, zipfile
import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import (
    CTImageStorage, DeflatedExplicitVRLittleEndian, ExplicitVRLittleEndian, ImplicitVRLittleEndian,
    RLELossless, generate_uid)

def phantom(n=32, rows=48, cols=40):
    z, y, x = np.mgrid[0:n, 0:rows, 0:cols].astype(np.float32)
    cz, cy, cx = (n-1)/2, (rows-1)/2, (cols-1)/2
    r = ((x-cx)/(cols*0.45))**2 + ((y-cy)/(rows*0.4))**2 + ((z-cz)/(n*0.48))**2
    vol = np.full((n, rows, cols), -1000, np.int16)  # air
    vol[r < 1] = 40                                   # soft tissue
    vol[(r > 0.7) & (r < 0.85)] = 1200                # bone shell
    s = ((x-cx-6)**2 + (y-cy)**2 + (z-cz)**2) < 16
    vol[s] = 2500                                     # dense sphere, off-centre in +column
    return vol

def write(out, explicit, shuffle=True, scout=True, codec=None):
    """codec: None (uncompressed), 'rle' (RLE Lossless) or 'deflate' (Deflated Explicit VR LE)."""
    vol = phantom()
    n, rows, cols = vol.shape
    uid = lambda *s: generate_uid(entropy_srcs=['bldrs-phantom', *map(str, s)])
    study, series, frame = uid('study'), uid('series'), uid('frame')
    slope, intercept = 1, -1024
    entries = []
    for k in range(n):
        meta = FileMetaDataset()
        meta.MediaStorageSOPClassUID = CTImageStorage
        meta.MediaStorageSOPInstanceUID = uid('instance', k)
        meta.TransferSyntaxUID = ExplicitVRLittleEndian if explicit else ImplicitVRLittleEndian
        ds = FileDataset(None, {}, file_meta=meta, preamble=b'\0' * 128)
        ds.SOPClassUID = CTImageStorage
        ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
        ds.Modality = 'CT'
        ds.PatientName = 'Phantom^Synthetic'
        ds.StudyInstanceUID, ds.SeriesInstanceUID, ds.FrameOfReferenceUID = study, series, frame
        # A nested sequence before the pixel data, which the reader must skip.
        item = Dataset(); item.CodeValue = 'X'; item.CodingSchemeDesignator = 'DCM'
        inner = Dataset(); inner.CodeMeaning = 'nested'
        item.ConceptNameCodeSequence = Sequence([inner])
        ds.ProcedureCodeSequence = Sequence([item])
        ds.InstanceNumber = k + 1
        ds.ImagePositionPatient = [-100.0, -80.0, 50.0 + 2.5 * k]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.PixelSpacing = [0.8, 0.7]  # row spacing, column spacing
        ds.SliceThickness = 3.0       # thicker than the 2.5 mm gap on purpose
        ds.Rows, ds.Columns = rows, cols
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = 'MONOCHROME2'
        ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 12, 11
        ds.PixelRepresentation = 0
        ds.RescaleSlope, ds.RescaleIntercept = slope, intercept
        ds.PixelData = (vol[k].astype(np.int32) - intercept).astype(np.uint16).tobytes()
        buf = io.BytesIO()
        if codec == 'rle':
            # pydicom's own RLE encoder: a writer independent of Share's decoder.
            ds.compress(RLELossless, generate_instance_uid=False)
            ds.save_as(buf, enforce_file_format=True)
        elif codec == 'deflate':
            ds.file_meta.TransferSyntaxUID = DeflatedExplicitVRLittleEndian
            ds.save_as(buf, enforce_file_format=True)
        else:
            ds.save_as(buf, enforce_file_format=True, implicit_vr=not explicit, little_endian=True)
        # Numbered without an extension, as many scanners write them.
        entries.append((f'CT1/DICOM/IM{k:04d}', buf.getvalue()))
    if scout:
        meta = FileMetaDataset()
        meta.MediaStorageSOPClassUID = CTImageStorage
        meta.MediaStorageSOPInstanceUID = uid('scout-instance')
        meta.TransferSyntaxUID = ExplicitVRLittleEndian
        ds = FileDataset(None, {}, file_meta=meta, preamble=b'\0' * 128)
        ds.SOPClassUID = CTImageStorage; ds.Modality = 'CT'
        ds.SeriesInstanceUID = uid('scout'); ds.InstanceNumber = 1
        ds.ImagePositionPatient = [0, 0, 0]; ds.ImageOrientationPatient = [1, 0, 0, 0, 0, -1]
        ds.PixelSpacing = [1, 1]; ds.Rows = ds.Columns = 16
        ds.SamplesPerPixel = 1; ds.PhotometricInterpretation = 'MONOCHROME2'
        ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = 16, 16, 15, 0
        ds.PixelData = np.zeros((16, 16), np.uint16).tobytes()
        buf = io.BytesIO(); ds.save_as(buf, enforce_file_format=True)
        entries.append(('CT1/SCOUT/IM0000', buf.getvalue()))
    if shuffle:
        random.Random(7).shuffle(entries)
    # A fixed timestamp per entry, so the zip's bytes don't change per run.
    stamp = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo('CT1/README.txt', stamp), 'Synthetic CT phantom for Bldrs Share tests.\n',
                   compress_type=zipfile.ZIP_DEFLATED)
        for name, data in entries:
            z.writestr(zipfile.ZipInfo(name, stamp), data, compress_type=zipfile.ZIP_DEFLATED)


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    outDir = os.path.join(here, '..', '..', 'testdata', 'models', 'dicom')
    write(os.path.join(outDir, 'phantom-ct.zip'), explicit=True)
    write(os.path.join(outDir, 'phantom-ct-implicit-vr.zip'), explicit=False)
    write(os.path.join(outDir, 'phantom-ct-rle.zip'), explicit=True, codec='rle')
    write(os.path.join(outDir, 'phantom-ct-deflated.zip'), explicit=True, codec='deflate')
