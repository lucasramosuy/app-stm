<svelte:head>
	<title>Privacidad — Buses Montevideo</title>
</svelte:head>

<main>
	<a href="/" class="back-link">← Volver al mapa</a>

	<h1>Privacidad</h1>
	<p class="updated">Última actualización: agosto de 2026</p>

	<section>
		<h2>Qué datos recolectamos</h2>
		<p>
			Buses Montevideo usa <strong>Microsoft Clarity</strong> para entender cómo
			se usa la app: qué partes de la pantalla se tocan, cómo se navega el mapa
			y en qué momentos aparecen errores. Esto incluye grabación de sesiones
			(movimientos, taps, scroll) y mapas de calor agregados.
		</p>
		<p>
			También usamos <strong>Sentry</strong> para recibir reportes automáticos
			de errores técnicos, y para que puedas enviarnos manualmente un problema
			o una sugerencia desde el botón de reporte dentro de la app.
		</p>
	</section>

	<section>
		<h2>Qué NO recolectamos</h2>
		<p>
			No pedimos registro ni cuentas de usuario. No accedemos a tu ubicación
			salvo que vos actives explícitamente "Mi ubicación" para planificar un
			viaje, y en ese caso la coordenada se usa solo para ese cálculo, no se
			guarda asociada a vos.
		</p>
	</section>

	<section>
		<h2>Con quién se comparte</h2>
		<p>
			Los datos de uso van a los servidores de Microsoft (Clarity) y Sentry (errores),
			ambos como proveedores de servicio, no como terceros con fines propios de
			publicidad. No vendemos ni compartimos datos con otras empresas.
		</p>
	</section>

	<section>
		<h2>Tus opciones</h2>
		<p>
			Podés usar la app sin que se grabe tu sesión bloqueando scripts de
			terceros con una extensión de tu navegador — el mapa, el buscador y el
			planificador de viajes funcionan igual sin Clarity activo.
		</p>
	</section>

	<section>
		<h2>Contacto</h2>
		<p>
			Para consultas sobre estos datos, usá el botón de reporte dentro de la
			app o escribinos a través del repositorio del proyecto en GitHub.
		</p>
	</section>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-5) var(--space-6);
	}

	.back-link {
		display: inline-block;
		color: var(--color-text-secondary);
		font-size: 13px;
		text-decoration: none;
		margin-bottom: var(--space-5);
	}

	.back-link:hover {
		color: var(--color-accent);
	}

	h1 {
		font-size: 26px;
		margin: 0 0 var(--space-1);
	}

	.updated {
		color: var(--color-text-secondary);
		font-size: 13px;
		margin: 0 0 var(--space-6);
	}

	section {
		margin-bottom: var(--space-5);
	}

	h2 {
		font-size: 16px;
		color: var(--color-accent);
		margin: 0 0 var(--space-2);
	}

	p {
		font-size: 14px;
		line-height: 1.6;
		color: var(--color-text);
		margin: 0 0 var(--space-3);
	}
</style>