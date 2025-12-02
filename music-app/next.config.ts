import { NextConfig } from 'next'

const nextConfig = {
  	reactStrictMode: true,
	allowedDevOrigins: [
	  '127.0.0.1',  // Add your local development origins
	  'localhost'   // Typically used alongside 127.0.0.1
	]
}

module.exports = nextConfig