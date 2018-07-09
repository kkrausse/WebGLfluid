var Simulation2D = (function() {
	// make sure you set type: gl.FLOAT for the textures! we need the precision
	function Simulation2D(initialDensity) {
		initialDensity = initialDensity;
		this.gl = gl;
		this.viscocity = 0.0000001;
		this.nu = 0.0000001;
		this.width = initialDensity.width;
		this.height = initialDensity.height;
		this.sources = null;
		this.densityField = initialDensity;
		this.velocityField = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
		this.tempTexture = new GL.Texture(this.width, this.height, {type: gl.FLOAT, format: gl.RG});
		this.tempTexture2 = new GL.Texture(this.width, this.height, {type: gl.FLOAT, format: gl.RG});
		// these are of the form {mesh: ,mode: , value:} where value is a 3d vector
		this.densityBoundaries = [];
		this.velocityBoundaries = [];

		init();
	}

	Simulation2D.prototype = {
		step: function(dt) {
			// first get user input or whatever. Maybe thats already coded into
			// boundary meshes or the boundary texture?

			velocityStep.call(this, dt);
			densityStep.call(this, dt);
		},
		run: function() {
			gl = this.gl;

			gl.onupdate = (function(dt) {
				this.step(dt);
			}).bind(this);
			gl.ondraw = (function() {
				basicMesh = basicMesh || GL.Mesh.plane({coords: true});
				this.densityField.bind();
				this.velocityField.bind();
				basicTextureShader.uniforms({
					color: [0.1, 0.2, 0.1, 1.0]
				}).draw(basicMesh);
				this.velocityField.unbind();
				this.densityField.unbind();
			}).bind(this);
			//gl.onupdate(0.001);
			gl.ondraw();
			gl.animate();
		}
	};

	function velocityStep(dt) {
		stableDiffuse.call(this, dt, this.velocityField, this.nu);
		setBoundary(this.velocityField, this.velocityBoundaries);
		project.call(this, dt);
		advect.call(this, dt, this.velocityField, this.velocityField);
		setBoundary(this.velocityField, this.velocityBoundaries);
		project.call(this, dt);
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
					'densityChange *= diff * textureSize.x * dt * textureSize.y;',
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
				'float a = diff * textureSize.x * dt * textureSize.y;',
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

		for (var i = 0; i < 5; i++) {
			this.tempTexture.drawTo(function() {
				field.bind();
				stabDiffuseShader.uniforms({
					diff: diff,
					dt: dt,
					textureSize: [field.width, field.height],
					texelSize: [1.0 / field.width, 1.0 / field.height]
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
				backtraceDivisor: 4
			}).draw(basicMesh);
			advected.unbind(0);
			advector.unbind(advectorNum);
		});
		
		advected.swapWith(this.tempTexture);
	}
	
	function setBoundary(fieldTexture, boundaries) {
		for (var i in boundaries) {
			var bound = boundaries[i];
			fieldTexture.drawTo(function() {
				solidMeshShader.uniforms({
					color: bound.value
				}).draw(bound.mesh, bound.mode);
			});
		}
	}


	// this is where we make the fluid incompressible
	function project(dt) {
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

				'gl_FragColor = vec4(-0.9*div, 0.0, 0.0, 1.0);',
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
				'newVelocity.x -= 0.5 * tmp ;',

				'texCoord += texelSize;',
				'tmp = texture2D(divergence, texCoord).t;',
				'texCoord.y -= 2.0 * texelSize.y;',
				'tmp -= texture2D(divergence, texCoord).t;',
				'newVelocity.y -= 0.5 *tmp ;',
				
				'gl_FragColor = vec4(newVelocity, 0.0, 1.0);',
			'}'
		].join('\n'));

		var vField = this.velocityField
		this.tempTexture.drawTo(function() {
			vField.bind();
			pShader1.uniforms({
				texelSize: [1.0 / vField.width,
							1.0 / vField.height]
			}).draw(basicMesh);
			vField.unbind();
		});
		
		// main loop to solve for the height field p
		for (var i = 0; i < 10; i++) {
			var tmpTex = this.tempTexture;
			this.tempTexture2.drawTo(function() {
				tmpTex.bind();
				pShader2.uniforms({
					texelSize: [1.0 / tmpTex.width,
								1.0 / tmpTex.height]
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
				texelSize: [1.0 / this.tempTexture.width,
							1.0 / this.tempTexture.height]
			}).draw(basicMesh);
			this.tempTexture.unbind(0);
			this.velocityField.unbind(1);
		}).bind(this));

		this.velocityField.swapWith(this.tempTexture2);
	}

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
			'uniform vec4 color;',
			'void main() {',
				'gl_FragColor = color;',
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
	}

	return Simulation2D;
})();
