var Simulation2D = (function() {
	function Simulation2D(initialDensity) {
		initialDensity = initialDensity;
		this.gl = gl;
		this.viscocity = 0.001;
		this.nu = 0.0002; // was at -.002
		this.width = initialDensity.width;
		this.height = initialDensity.height;
		this.densityField = initialDensity;

		this.velocityField = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
		this.tempTexture = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
		this.tempTexture2 = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
		if (!this.tempTexture.canDrawTo()) 
			alert('your system does not support rendering to floating point textures' +
					'which is unfortunately required for this demo!');

		// these are of the form {mesh: ,mode: , value:} where value is a 3d vector
		this.densityBoundaries = [];
		this.velocityBoundaries = [];
		this.surfaceMeshes = [];

		init();
	}

	Simulation2D.prototype = {
		step: function(dt) {
			dt = dt;
			velocityStep.call(this, dt);
			densityStep.call(this, dt);
		},
		run: function() {
			gl = this.gl;
			console.log('spare');

			gl.onupdate = (function(dt) {
				this.step(dt);
			}).bind(this);

			gl.ondraw = (function() {
				basicMesh = basicMesh || GL.Mesh.plane({coords: true});

				this.densityField.bind();
			//	this.velocityField.bind();
				basicTextureShader.draw(basicMesh);
			//	coolVelocityShader.draw(basicMesh);
				this.velocityField.unbind();
				this.densityField.unbind();

				// draw the surface meshes
				for (var i in this.surfaceMeshes) {
					var m = this.surfaceMeshes[i];
					solidMeshShader.uniforms({
						color: m.color
					}).draw(m.mesh);
				}
			}).bind(this);
			gl.ondraw();
			gl.animate();
		},
		moveObj: function(id, dX, dY) {
			moveObj.call(this, id, dX, dY);
		},
		// possible params:
		// fanSpeed: int between -2 and 2
		// renderVelocity: bool
		// ballRadius: 
		setParam: function(params) {

		}
	};

	function velocityStep(dt) {
		//setBoundary(this.velocityField, this.velocityBoundaries);
		stableDiffuse.call(this, dt, this.velocityField, this.nu);
		setBoundary(this.velocityField, this.velocityBoundaries);
		//project.call(this, dt);
		checkFramebuffer();
		advect.call(this, dt, this.velocityField, this.velocityField);
		setBoundary(this.velocityField, this.velocityBoundaries);
		project.call(this, dt);
		setBoundary(this.velocityField, this.velocityBoundaries);
	}

	function densityStep(dt) {
		unstableDiffuse.call(this, dt, this.densityField, this.viscocity);
		setBoundary(this.densityField, this.densityBoundaries);
		advect.call(this, dt, this.densityField, this.velocityField);
		setBoundary(this.velocityField, this.velocityBoundaries);
	}

	// this is the unstable version
	function unstableDiffuse(dt, field, diff, useStable) {
			unstabShader = unstabShader || new GL.Shader(basicVertexSource, [
				'uniform sampler2D prevDiff;',
				'uniform float diff;',
				'uniform float dt;',
				'uniform vec2 textureSize;',
				'varying vec2 coord;',
				'void main() {',
					'vec2 texelSize;',
					'texelSize.x = 1.0 / textureSize.x;',
					'texelSize.y = 1.0 / textureSize.y;',
					'vec2 texCoord = coord;',
					'',
					'vec4 densityChange = -4.0 * texture2D(prevDiff, texCoord);',
					'texCoord.x += texelSize.x;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'texCoord.x -= 2.0 * texelSize.x;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'texCoord += texelSize;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'texCoord.y -= 2.0 * texelSize.y;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'densityChange *= diff * dt ;',
					'',
					'gl_FragColor = texture2D(prevDiff, coord) + densityChange;',
				'}',
			].join('\n'));

		this.tempTexture.drawTo(function() {
			field.bind();
			unstabShader.uniforms({
				diff: diff,
				dt: dt,
				textureSize: [field.width, field.height]
			}).draw(basicMesh);
			field.unbind();
		});
		field.swapWith(this.tempTexture);
	}

	function stableDiffuse(dt, field, diff, useStable) {
		stabDiffuseShader = stabDiffuseShader || new GL.Shader(
											basicVertexSource, [
			'uniform sampler2D field;',
			'uniform float diff;',
			'uniform float dt;',
			'uniform vec2 textureSize;',
			'uniform vec2 texelSize;',
			'varying vec2 coord;',

			'void main() {',
				'vec2 texCoord = coord;',
				'float a = diff * dt;',
				'vec4 change;',
				
				'texCoord.x += texelSize.x;',
				'change = texture2D(field, texCoord);',
				'texCoord.x -= 2.0 * texelSize.x;',
				'change += texture2D(field, texCoord);',
				'texCoord += texelSize;',
				'change += texture2D(field, texCoord);',
				'texCoord.y -= 2.0 * texelSize.y;',
				'change += texture2D(field, texCoord);',
				'change *= a;',
				'change += texture2D(field, coord);',

				'gl_FragColor = change / (1.0+4.0*a);',
			'}'
		].join('\n'));

		for (var i = 0; i < 3; i++) {
			this.tempTexture.drawTo(function() {
				field.bind();
				stabDiffuseShader.uniforms({
					diff: diff,
					dt: dt,
					textureSize: [field.width, field.height],
					texelSize: [1 / field.width, 1 / field.height]
				}).draw(basicMesh);
				field.unbind();
			});
			field.swapWith(this.tempTexture);
		}
	}

	function advect(dt, advected, advector) {
		advectShader = advectShader || new GL.Shader(basicVertexSource, [
			'uniform sampler2D advected;',
			'uniform sampler2D advector;',
			'uniform float dt;',
			'uniform float backtraceDivisor;',
			'varying vec2 coord;',

			'void main() {',
				'vec2 backtrace = texture2D(advector, coord).xy;',
				'vec2 texCoord = coord * backtraceDivisor;',
				'backtrace *= dt;',
				'texCoord -= backtrace;',
				'gl_FragColor = texture2D(advected, texCoord / backtraceDivisor);',
		'}'].join('\n'));

		advectorNum = advected.id === advector.id ? 0 : 1;

		// slightly worried about self-advection of velocity since I dont
		// know if you can use an alias in the same shader...
		this.tempTexture.drawTo(function() {
			advected.bind(0);
			advector.bind(advectorNum);
			advectShader.uniforms({
				advected: 0,
				advector: advectorNum,
				dt: dt,
				backtraceDivisor: 20
			}).draw(basicMesh);
			advected.unbind(0);
			advector.unbind(advectorNum);
		});
		
		advected.swapWith(this.tempTexture);
	}
	
	function setBoundary(fieldTexture, boundaries) {
		for (var i in boundaries) {
			var bound = boundaries[i];
			if (bound.movement) { // set the movement force instead.
				moveObj(bound.mesh, bound.movement[0], bound.movement[1], fieldTexture);
				for (var i in bound.movement) {
					bound.movement[i] = bound.movement[i] - bound.movement[i] * 0.8;
				}
			} else {
				fieldTexture.drawTo(function() {
					solidMeshShader.uniforms({
						color: bound.value
					}).draw(bound.mesh, bound.mode);
				});
			}
		}
	}


	function project(dt) {
		project1.call(this, dt, 9);
		project1.call(this, dt, 1);
	}

	// this is where we make the fluid incompressible
	function project1(dt, range) {
		range = range || 1;
		// this one sets the divergence and initial p 
		// divergence goes in the 'r' spot of the tempTexture and
		// p goes in the 'g' spot
		pShader1 = pShader1 || new GL.Shader(basicVertexSource, [
			'uniform sampler2D velocity;',
			'uniform vec2 texelSize;',
			'varying vec2 coord;',

			'void main() {',
				'vec2 texCoord = coord;',
				'texCoord.x += texelSize.x;',
				'float div = texture2D(velocity, texCoord).s;',
				'texCoord.x -= 2.0 * texelSize.x;',
				'div -= texture2D(velocity, texCoord).s;',
				'texCoord += texelSize;',
				'div += texture2D(velocity, texCoord).t;',
				'texCoord.y -= 2.0 * texelSize.y;',
				'div -= texture2D(velocity, texCoord).t;',

				'gl_FragColor = vec4(-texelSize.x * div, 0.0, 0.0, 1.0);',
			'}'
		].join('\n'));

		// sets the integral of the divergence, p.
		// this is a single step of Gauss-Seidel relaxation
		pShader2 = pShader2 || new GL.Shader(basicVertexSource, [
			'uniform sampler2D divergence;',
			'uniform vec2 texelSize;',
			'varying vec2 coord;',

			'void main() {',
				'float p = texture2D(divergence, coord).s;',
				'float div = p;',
				'vec2 texCoord = coord;',
				'texCoord.x += texelSize.x;',
				'p += texture2D(divergence, texCoord).t;',
				'texCoord.x -= 2.0 * texelSize.x;',
				'p += texture2D(divergence, texCoord).t;',
				'texCoord += texelSize;',
				'p += texture2D(divergence, texCoord).t;',
				'texCoord.y -= 2.0 * texelSize.y;',
				'p += texture2D(divergence, texCoord).t;',
				
				'gl_FragColor = vec4(div, p / 4.0, 0.0, 1.0);',
			'}'
		].join('\n'));

		// this one finally subtracts the gradient of the height field from 
		pShader3 = pShader3 || new GL.Shader(basicVertexSource, [
			'uniform sampler2D divergence;',
			'uniform sampler2D velocity;',
			'uniform vec2 texelSize;',
			'varying vec2 coord;',

			'void main() {',
				'vec2 texCoord = coord;',
				'vec2 newVelocity = texture2D(velocity, coord).xy;',
				'float tmp;',

				'texCoord.x += texelSize.x;',
				'tmp = texture2D(divergence, texCoord).t;',
				'texCoord.x -= 2.0 * texelSize.x;',
				'tmp -= texture2D(divergence, texCoord).t;',
				'newVelocity.x -= 0.5 * tmp / texelSize.x ;',

				'texCoord += texelSize;',
				'tmp = texture2D(divergence, texCoord).t;',
				'texCoord.y -= 2.0 * texelSize.y;',
				'tmp -= texture2D(divergence, texCoord).t;',
				'newVelocity.y -= 0.5 * tmp / texelSize.y ;',
				
				'gl_FragColor = vec4(newVelocity, 0.0, 1.0);',
			'}'
		].join('\n'));

		var vField = this.velocityField
		this.tempTexture.drawTo(function() {
			vField.bind();
			pShader1.uniforms({
				texelSize: [range / vField.width,
							range / vField.height]
			}).draw(basicMesh);
			vField.unbind();
		});
		
		// main loop to solve for the height field p
		for (var i = 0; i < 5; i++) {
			var tmpTex = this.tempTexture;
			this.tempTexture2.drawTo(function() {
				tmpTex.bind();
				pShader2.uniforms({
					texelSize: [range / tmpTex.width,
								range / tmpTex.height]
				}).draw(basicMesh);
				tmpTex.unbind();
			});
			this.tempTexture.swapWith(this.tempTexture2);
		}

		this.tempTexture2.drawTo((function() {
			this.tempTexture.bind(0);
			this.velocityField.bind(1);
			pShader3.uniforms({
				divergence: 0,
				velocity: 1,
				texelSize: [range / this.tempTexture.width,
							range / this.tempTexture.height]
			}).draw(basicMesh);
			this.tempTexture.unbind(0);
			this.velocityField.unbind(1);
		}).bind(this));

		this.velocityField.swapWith(this.tempTexture2);
	}

	function moveObj(mesh, dX, dY, velocityField) {
		moveShader = moveShader || new GL.Shader([
			'varying vec2 normal;',
			'void main() {',
				'normal = gl_Normal.xy;',
				'gl_Position = gl_Vertex;',
			'}',
		].join('\n'), [
			'uniform vec2 movementDir;',
			'varying vec2 normal;',
			'void main() {',
				'gl_FragColor = vec4(dot(normal, movementDir)*normal, 0.0, 1.0);',
			'}'
		].join('\n'));
			
		velocityField.drawTo(function() {
			moveShader.uniforms({
				movementDir: [dX, dY]
			}).draw(mesh, gl.TRIANGLES)
		});
		gl.popMatrix();
	}

	var moveShader;
	var pShader1p;
	var pShader1, pShader2, pShader3;
	var basicCanvas = null;
	var unstabShader = null;
	var advectShader = null;
	var basicMesh = null;
	var solidMeshShader = null;
	var basicTextureShader = null;
	var stabDiffuseShader = null;
	var basicVertexSource = [
		'varying vec2 coord;',
		'void main() {',
			'coord = gl_TexCoord.st;',
			'gl_Position = gl_Vertex;',
		'}'
	].join('\n')

	function init() {
		basicMesh = GL.Mesh.plane({coords: true});
		basicTextureShader = new GL.Shader(basicVertexSource, [
			'varying vec2 coord;',
			'uniform sampler2D texture;',
			'void main() {',
				'gl_FragColor = vec4(texture2D(texture, coord).rgb, 1.0);',
			'}'].join('\n'));

		solidMeshShader = new GL.Shader('\
			void main() {\
				gl_Position = gl_Vertex;\
			}\
			', '\
			uniform vec3 color;\
			void main() {\
				gl_FragColor = vec4(color, 1.0);\
			}'
		);

		coolVelocityShader = new GL.Shader(basicVertexSource, [
			'varying vec2 coord;',
			'uniform sampler2D texture;',
			'void main() {',
				'vec2 v = texture2D(texture, coord).rg;',
				'float xDir = v.r / length(v);',
				'xDir = (xDir + 1.0) / 2.0;',
				'gl_FragColor = vec4(xDir, 1.0 - xDir, length(v), 1.0);',
			'}'].join('\n'));
	}

	function checkFramebuffer() {
		printFramebufferProblem(gl.checkFramebufferStatus(gl.FRAMEBUFFER));
		function printFramebufferProblem(c) {
			switch (c) {
			case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
				console.log('incomplete attatchment');
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
				console.log('incomplete dim');
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
				console.log('missing attatchment');
				break;
			case gl.FRAMEBUFFER_UNSUPPORTED:
				console.log('framebuff unsupported');
				break;
			}
		}
	}

	return Simulation2D;
})();

function inMeshFunc(mesh) {
	// all params assumed to be 2D arrays
	function isInTriangle(v1, v2, v3, p) {
		function sub(v1, v2) {
			return [v1[0] - v2[0], v1[1] - v2[1]];
		}
		function cross(v1, v2) {
			return v1[0] * v2[1] - v1[1] * v2[0];
		}
		function sameSign(a, b) {
			return Math.abs(a + b) > Math.abs(a);
		}
		// checks if p1 and p2 are on the same side of the line formed by
		// v1 and v2
		function rightSide(v1, v2, p1, p2) {
			var dir = sub(v2, v1);
			return sameSign(cross(dir, sub(p1, v1)), cross(dir, sub(p2, v1)));
		}

		return rightSide(v1, v2, v3, p) && rightSide(v1, v3, v2, p) &&
				rightSide(v2, v3, v1, p);
	}
	return function(e) {
		var vs = mesh.vertices;
		for (var i in mesh.triangles) {
			var t = mesh.triangles[i];
			if (isInTriangle(vs[t[0]], vs[t[1]], vs[t[2]], [e.x, e.y]))
				return true;
		}
		return false;
	}
}

//
//
function createCircle(radius) {
	var numPoints = 20;
	var mesh = new GL.Mesh({normals: true});
	mesh.vertices.push([0.0, 0.0, 0.0]);
	mesh.normals.push([0.0, 0.0, 0.0]);
	for (var i = 0; i < numPoints; i++) {
		var theta = i * 2 * Math.PI / numPoints;
		var p = [Math.cos(theta)*radius, Math.sin(theta)*radius, 0];
		mesh.vertices.push(p);
		mesh.normals.push(p);
		mesh.triangles.push([0, mesh.vertices.length-1, mesh.vertices.length]);
	}
	var t = mesh.triangles.pop();
	t[2] = 1;
	mesh.triangles.push(t);
	mesh.compile();
	return mesh;
}

function MovableObj(mesh, isInside, sim) {
	this.mesh = mesh;
	this.sim = sim;
	mesh.v0 = mesh.vertices[0].slice();
	this.isInside = isInside;
	this.selected = false;
	this.id = sim.surfaceMeshes.length;
	this.movement = [0.0, 0.0];
	
	sim.surfaceMeshes.push({
		mesh: mesh,
		color: [0.0, 0.1, 0.3]
	});

	sim.velocityBoundaries.push({
		mesh: mesh,
		movement: this.movement,
		value: [0.0, 0.0, 0.0],
		mode: gl.TRIANGLES
	});
	
	function normalize(e) {
		var w = gl.canvas.width;
		var h = gl.canvas.height;
		e.x = e.x * 2 / w - 1;
		e.deltaX /= w / 2;
		e.y = 1 - e.y * 2 / h;
		e.deltaY /= -h/2;
	}

	gl.onmousedown = (function(e) {
		normalize(e);
		if (this.isInside(e))
			this.selected = true;
	}).bind(this);

	gl.onmouseup = (function(e) {
		this.selected = false;
	}).bind(this);

	gl.onmousemove = (function(e) {
		if (this.selected) move.call(this, e);
	}).bind(this);

	function move(e) {
		normalize(e);
		for (var i in this.mesh.vertices) {
			var vert = this.mesh.vertices[i];
			vert[0] += e.deltaX;
			vert[1] += e.deltaY;
		}
		this.mesh.compile();
		this.movement[0] += e.deltaX * 3000;
		this.movement[1] += e.deltaY * 3000;
	}
}
