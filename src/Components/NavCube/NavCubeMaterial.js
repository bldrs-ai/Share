import { MeshLambertMaterial, MeshBasicMaterial, DoubleSide, Color, LineBasicMaterial } from "three";

export const LightColor = {
	light: 0x404040,
	normalCube: new Color("rgb(255, 255, 255)"),
	hoverCube: new Color("rgb(14, 237, 51)"),
	textCube: new Color("rgb(255, 0, 0)"),
	refPlan: new Color("rgb(245, 245, 245)"),
	ring: new Color("rgb(123, 130, 28)"),
};
export const NavCubeMaterial = {
	mainCube: (textTex) => {
		return new MeshBasicMaterial({
			color: "skyblue",
			map: textTex,
			wireframe: true,
		});
	},
	normalCube: new MeshBasicMaterial({
		transparent: true,
		opacity: 1,
		color: LightColor.normalCube,
		depthTest: true,
		// wireframe: true,
	}),
	hoverCube: new MeshLambertMaterial({
		transparent: true,
		opacity: 1,
		color: LightColor.hoverCube,
		depthTest: true,
	}),
	textCube: new MeshLambertMaterial({
		transparent: true,
		opacity: 1,
		color: LightColor.textCube,
		depthTest: true,
	}),

	ring: new MeshLambertMaterial({
		transparent: true,
		opacity: 0.5,
		color: LightColor.hoverCube,
		side: DoubleSide,
		depthWrite: true,
		depthTest: true,
	}),
	textRing: new MeshLambertMaterial({
		transparent: true,
		opacity: 1,
		color: LightColor.ring,
		side: DoubleSide,
		depthWrite: true,
		depthTest: true,
	}),
	outLine: new LineBasicMaterial({
		color: "black",
		linewidth: 10,
	}),
};
