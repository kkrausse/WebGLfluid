var Simulation2D = (function() {
	// make sure you set type: gl.FLOAT for the textures! we need the precision
	function Simulation2D(initialDensity) {
		initialDensity = initialDensity;
		this.gl = gl;
		this.viscocity = 0.00001;
		this.nu = 0.0001;
		this.width = initialDensity.width;
		this.height = initialDensity.height;
		this.sources = null;
		this.densityField = initialDensity;
		this.velocityField = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
		this.tempTexture = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
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
				this.step(dt/ 10.0);
			}).bind(this);
			gl.ondraw = (function() {
				basicMesh = basicMesh || GL.Mesh.plane({coords: true});
				this.densityField.bind();
//				this.velocityField.bind();
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
		unstabDiffuse.call(this, dt, this.velocityField, this.nu);
		setBoundary(this.velocityField, this.velocityBoundaries);
		advect.call(this, dt, this.velocityField, this.velocityField);
		setBoundary(this.velocityField, this.velocityBoundaries);
	}

	function densityStep(dt) {
		unstabDiffuse.call(this, dt, this.densityField, this.viscocity);
		setBoundary(this.densityField, this.densityBoundaries);
		advect.call(this, dt, this.densityField, this.velocityField);
		setBoundary(this.velocityField, this.velocityBoundaries);
	}

	// this is the unstable version
	// I have tested it, and it is unstable like it says.
	// I cant get the speed of diffusion that may be needed
	function unstabDiffuse(dt, field, diff) {
			unstabShader = unstabShader || new GL.Shader('\
				varying vec2 coord;\
				void main() {\
					coord = gl_TexCoord.st;\
					gl_Position = gl_Vertex;\
				}', [
				'uniform sampler2D prevDiff;',
				'uniform float diff;',
				'uniform float dt;',
				'uniform vec2 textureSize;',
				'varying vec2 coord;',
				'void main() {',
					'vec2 texelSize;',
					'texelSize.x = 5.0 / textureSize.x;',
					'texelSize.y = 5.0 / textureSize.y;',
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

		stabDiffShader = stabDiffShader || new GL.Shader(
			varying vec2 coord;
			void main() {
				coord = gl_TexCoord.st;
				gl_Position = gl_Vertex;
			'}'
		].join('\n'), [
			'uniform sampler2D field;
			'uniform float diff;'
			'uniform float dt;'
			'uniform vec2 textureSize;'
			'varying vec2 coord;'
			'void main() {'
				'vec2 texCoord = coord;'
				'float a = diff * textureSize.x * dt * textureSize.y;'
				'vec2 texelSize;'
				'vec4 change;'
				'texelSize.x = 1.0 / textureSize.x;'
				'texelSize.y = 1.0 / textureSize.y;'
				
				'texCoord.x += texelSize.x;',
				'change = texture2D(field, texCoord);',
				'texCoord.x -= 2.0 * texelSize.x;',
				'change += texture2D(field, texCoord);',
				'texCoord += texelSize;',
				'change += texture2D(field, texCoord);',
				'texCoord.y -= 2.0 * texelSize.y;',
				'change += texture2D(field, texCoord);',
				'change *= a;'
				'change += texture2D(field, coord);'
				
				'gl_FragColor = change / (1+4*a);'
			'}'
		].join('\n'));


		/*
		 * unstable stuff right here. wasnt working
		this.tempTexture.drawTo(function() {
			field.bind();
			unstabShader.uniforms({
				diff: diff,
				dt: dt,
				textureSize: [field.width, field.height]
			}).draw(basicMesh);
			field.unbind();
		});
		*/

		field.swapWith(this.tempTexture);
	}

	function advect(dt, advected, advector) {
		advectShader = advectShader || new GL.Shader('\
			varying vec2 coord;\
			void main() {\
				coord = gl_TexCoord.st;\
				gl_Position = gl_Vertex;\
			}', [
			'uniform sampler2D advected;',
			'uniform sampler2D advector;',
			'uniform float dt;',
			'varying vec2 coord;',

			'void main() {',
				'vec2 backtrace = texture2D(advector, coord).st;',
				'backtrace *= dt * 0.2;',
				'gl_FragColor = texture2D(advected, coord - backtrace);',
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
				dt: dt
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

	/* I dont really need this right now.. */
	function getSolidTexture(r, g, b) {
		basicCanvas = basicCanvas || document.createElement('canvas');
		var c = basicCanvas.getContext('2d');
		basicCanvas.width = basicCanvas.height = 1;
		c.fillStyle = 'rgb(' + r + ', ' + g + ', ' + b + ')';
		c.fill();
		return Texture.fromImage(basicCanvas);
	}

	var basicCanvas = null;
	var unstabShader = null;
	var advectShader = null;
	var basicMesh = null;
	var solidMeshShader = null;
	var basicTextureShader = null;

	function init() {
		basicMesh = GL.Mesh.plane({coords: true});
		basicTextureShader = new GL.Shader(
			['varying vec2 coord;',
			'void main() {',
				'coord = gl_TexCoord.st;',
				'gl_Position = gl_Vertex;',
			'}',
		''].join('\n'), ['',
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
