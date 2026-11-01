import type {Metadata} from 'next'
import {ReactNode} from 'react'
import {Box, Link as MuiLink, Typography} from '@mui/material'
import PageShell from '@/components/PageShell'


// The viewer links here when it rejects a native CAD file
// (`src/loader/formatGuidance.js`, Share#2007): each section's `id` is an
// anchor that file names, and `formatGuidance.test.js` checks they all
// exist. Rename one and the dialog's link lands on the top of the page.

const TITLE = 'Open Native CAD Files'
const DESCRIPTION =
  'Share opens IFC, STEP and other open formats in the browser. How to export ' +
  'one from Revit, AutoCAD, SolidWorks and CATIA.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {canonical: '/help/native-cad-files'},
  openGraph: {title: TITLE, description: DESCRIPTION, type: 'article'},
  twitter: {card: 'summary', title: TITLE, description: DESCRIPTION},
}


/**
 * A section heading with an anchor the viewer's dialog links to.
 *
 * @param id The anchor
 * @param children Heading text
 */
function Section({id, children}: {id: string, children: ReactNode}) {
  return (
    <Typography id={id} variant="h3" component="h2" sx={{mt: 5, mb: 1.5, scrollMarginTop: '5rem'}}>
      {children}
    </Typography>
  )
}


/** An ordered list in the site's list rhythm (as MdxContent's `ol`). */
function Steps({children}: {children: ReactNode}) {
  return <Box component="ol" sx={{pl: 3, my: 2, '& li': {mb: 0.75}}}>{children}</Box>
}


/** An unordered list in the site's list rhythm (as MdxContent's `ul`). */
function Bullets({children}: {children: ReactNode}) {
  return <Box component="ul" sx={{pl: 3, my: 2, '& li': {mb: 0.75}}}>{children}</Box>
}


/** A list item set in body type. */
function Item({children}: {children: ReactNode}) {
  return <Typography component="li" variant="body1">{children}</Typography>
}


export default function NativeCadFilesPage() {
  return (
    <PageShell title={TITLE}>
      <Typography variant="body1">
        Share opens open formats &mdash; IFC, STEP, glTF, STL, OBJ and more &mdash;
        directly in your browser, with no upload. Native files from Revit, AutoCAD,
        SolidWorks and CATIA are proprietary, and Share can&apos;t read them. Export an
        open format from the program that made the model, then open that.
      </Typography>

      <Section id="revit">Revit (.rvt, .rfa, .rte)</Section>
      <Typography variant="body1">Export IFC, then open the .ifc in Share.</Typography>
      <Steps>
        <Item>Open the project in Revit, and open a 3D view showing what you want to share.</Item>
        <Item>Choose <strong>File &rarr; Export &rarr; IFC</strong>.</Item>
        <Item>
          In the Export IFC dialog, choose <strong>Modify setup&hellip;</strong> and set:
          <Bullets>
            <Item><strong>IFC version:</strong> IFC4 Reference View. Use IFC 2x3 Coordination
              View 2.0 if the people you share with need IFC 2x3.</Item>
            <Item><strong>File type:</strong> IFC, or Zipped IFC (.ifczip). Not IFC XML.</Item>
            <Item><strong>Export only elements visible in view:</strong> on, so the file
              holds what the 3D view shows and no more.</Item>
          </Bullets>
        </Item>
        <Item>Export, then open the .ifc in Share: drag it onto the viewer, or
          choose <strong>Open &rarr; Local &rarr; Browse</strong>.</Item>
      </Steps>
      <Typography variant="body1">
        Revit may also write a .txt file with the same name next to the .ifc. It
        isn&apos;t the model: open the .ifc, not the .txt.
      </Typography>

      <Section id="autocad">AutoCAD (.dwg, .dwf, .dwfx)</Section>
      <Typography variant="body1">
        DWG and DWF are drawing formats, and Share has no reader for them. If the
        drawing came from a 3D model &mdash; Revit, Civil 3D, Inventor, SolidWorks &mdash;
        export IFC or STEP from that program instead, and open that.
      </Typography>

      <Section id="solidworks">SolidWorks (.sldprt, .sldasm)</Section>
      <Steps>
        <Item>Open the part or assembly in SolidWorks.</Item>
        <Item>Choose <strong>File &rarr; Save As</strong>, and set <strong>Save as
          type</strong> to <strong>STEP AP214 (*.step; *.stp)</strong>.</Item>
        <Item>Save, then open the .step in Share.</Item>
      </Steps>

      <Section id="catia">CATIA (.CATPart, .CATProduct, .model)</Section>
      <Steps>
        <Item>Open the part or product in CATIA.</Item>
        <Item>Choose <strong>File &rarr; Save As</strong>, and set <strong>Save as
          type</strong> to <strong>stp</strong>.</Item>
        <Item>Save, then open the .stp in Share.</Item>
      </Steps>

      <Section id="supported-formats">What Share opens</Section>
      <Bullets>
        <Item><strong>BIM:</strong> IFC (.ifc), and zipped IFC (.ifczip)</Item>
        <Item><strong>CAD:</strong> STEP (.step, .stp)</Item>
        <Item><strong>Meshes:</strong> glTF (.gltf, .glb), OBJ (.obj), STL (.stl),
          FBX (.fbx), PLY (.ply), USD (.usd, .usda, .usdc, .usdz)</Item>
        <Item><strong>Point clouds and splats:</strong> XYZ (.xyz), Gaussian splats
          (.splat, .ksplat, .spz, .sog)</Item>
        <Item><strong>Other:</strong> molecules (.pdb), Align dental scans (.adf)</Item>
      </Bullets>
      <Typography variant="body1">
        A gzipped copy of any of these, such as model.glb.gz, opens too, and so
        does a .zip with one inside: Share opens the model, or asks which one when
        there are several.{' '}
        <MuiLink href="/">Open Share</MuiLink>.
      </Typography>
    </PageShell>
  )
}
