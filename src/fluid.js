var Simulation2D = (function() {
	function Simulation2D(initialDensity) {
		initialDensity = initialDensity;
		this.gl = gl;
		this.viscocity = 0.0001;
		this.width = initialDensity.width;
		this.height = initialDensity.height;
		this.sources = null;
		this.densityField = initialDensity;
		this.tempTexture = new GL.Texture(this.width, this.height, {type: gl.FLOAT});
		// these are of the form {mesh: ,mode: , value:} where value is a 3d vector
		this.densityBoundaries = [];
		this.velocityBoundaries = [];
	}

	Simulation2D.prototype = {
		step: function(dt) {
			// first get user input or whatever. Maybe thats already coded into
			// boundary meshes or the boundary texture?

			densityStep.call(this, dt);
		},
		run: function() {
			gl = this.gl;
			basicTextureShader = basicTextureShader || new GL.Shader(
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

			gl.onupdate = (function(dt) {
				this.step(dt/ 10.0);
			}).bind(this);
			gl.ondraw = (function() {
				basicMesh = basicMesh || GL.Mesh.plane({coords: true});
				this.densityField.bind();
				basicTextureShader.uniforms({
					color: [0.1, 0.2, 0.1, 1.0]
				}).draw(basicMesh);
				this.densityField.unbind();
			}).bind(this);
			//gl.onupdate(0.001);
			gl.ondraw();
			gl.animate();
		}
	};

	function velocityStep(dt) {
		unstabDiffuse.call(this, dt, this.viscocity);
	}

	function densityStep(dt) {
		unstabDiffuse.call(this, dt);
		setBoundary(this.densityField, this.densityBoundaries);
	}

	// this is the unstable version
	// I have tested it, and it is unstable like it says.
	// I cant get the speed of diffusion that may be needed
	function unstabDiffuse(dt) {
		this.tempTexture.drawTo((function() {
			this.densityField.bind();
			var unstabShader = new GL.Shader('\
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
					'texelSize.x = 1.0 / textureSize.x;',
					'texelSize.y = 1.0 / textureSize.y;',
					'vec2 texCoord = coord;',
					'',
					'vec4 densityChange = -4.0 * texture2D(prevDiff, texCoord);',
					'texCoord.x += texelSize.x;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'texCoord.x -= 2.0 * texelSize.x;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'texCoord.xy += texelSize;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'texCoord.y -= 2.0 * texelSize.y;',
					'densityChange += texture2D(prevDiff, texCoord);',
					'densityChange *= diff * textureSize.x * dt * textureSize.y;',
					'',
					'gl_FragColor = texture2D(prevDiff, coord) + densityChange;',
				'}',
			].join('\n'));

			basicMesh = basicMesh || GL.Mesh.plane({coords: true});
			unstabShader.uniforms({
				diff: this.viscocity,
				dt: dt,
				textureSize: [this.width, this.height]
			}).draw(basicMesh);
			this.densityField.unbind();

		}).bind(this));
		this.densityField.swapWith(this.tempTexture);
	}

	function stableDiffuse(dt) {

	}

	function advect(dt) {
		
	}
	
	function setBoundary(fieldTexture, boundaries) {
		solidMeshShader = solidMeshShader || new GL.Shader('\
			void main() {\
				gl_Position = gl_Vertex;\
			}\
			', '\
			uniform vec3 color;\
			void main() {\
				gl_FragColor = vec4(color, 1.0);\
			}'
		);
		
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
	var basicMesh = null;
	var solidMeshShader = null;
	var basicTextureShader = null;
	return Simulation2D;
})();
