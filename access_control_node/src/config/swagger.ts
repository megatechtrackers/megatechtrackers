import swaggerJsdoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';
import { getServerConfig } from './env.js';

const config = getServerConfig();

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Access Gateway API',
    version: '1.0.0',
    description:
      'Access Gateway for secure Grafana embedding: generates time-limited embed tokens, enforces locked filters, and proxies dashboard requests.',
    contact: {
      name: 'API Support',
      email: 'support@megatechtrackers.com'
    }
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Development server'
    },
    {
      url: 'https://your-domain.example',
      description: 'Production server (replace with your domain)'
    }
  ],
  components: {
    securitySchemes: {
      FrappeUser: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Frappe-User',
        description: 'Frappe username for authentication'
      },
      FrappeSession: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Frappe-Session-Id',
        description: 'Frappe session ID (optional)'
      }
    },
    schemas: {
      EmbedUrlRequest: {
        type: 'object',
        required: ['reportId', 'frappeUser'],
        properties: {
          reportId: {
            type: 'integer',
            description: 'Grafana dashboard ID',
            example: 1
          },
          reportUid: {
            type: 'string',
            description: 'Grafana dashboard UID (optional)',
            example: 'abc123'
          },
          filters: {
            type: 'object',
            description: 'Context filters (vehicle, company, department)',
            properties: {
              vehicle: {
                type: 'string',
                example: 'V001'
              },
              company: {
                type: 'string',
                example: 'Company A'
              },
              department: {
                type: 'string',
                example: 'Dept 1'
              }
            }
          },
          frappeUser: {
            type: 'string',
            description: 'Frappe username',
            example: 'user@example.com'
          }
        }
      },
      EmbedUrlResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          embedUrl: {
            type: 'string',
            description: 'Authenticated Grafana embed URL',
            example:
              'http://localhost:3000/d/abc123?token=TOKEN&kiosk=1&orgId=1&var-vehicle=V001&var-vehicle-locked=true'
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-02-01T12:00:00.000Z'
          }
        }
      },
      GrafanaReport: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1
          },
          uid: {
            type: 'string',
            example: 'abc123'
          },
          title: {
            type: 'string',
            example: 'Dashboard Title'
          },
          url: {
            type: 'string',
            example: '/d/abc123'
          },
          folderTitle: {
            type: 'string',
            example: 'Folder'
          },
          folderUid: {
            type: 'string',
            example: 'folder-uid'
          }
        }
      },
      ReportAssignment: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1
          },
          uid: {
            type: 'string',
            example: 'abc123'
          },
          name: {
            type: 'string',
            example: 'Report Name'
          },
          context: {
            type: 'object',
            properties: {
              vehicles: {
                type: 'array',
                items: { type: 'string' },
                example: ['V001', 'V002']
              },
              companies: {
                type: 'array',
                items: { type: 'string' },
                example: ['Company A']
              },
              departments: {
                type: 'array',
                items: { type: 'string' },
                example: ['Dept 1']
              }
            }
          },
          inherited: {
            type: 'boolean',
            example: false
          },
          source: {
            type: 'string',
            example: 'direct'
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            example: 'Error message'
          },
          message: {
            type: 'string',
            example: 'Detailed error message'
          },
          statusCode: {
            type: 'integer',
            example: 400
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                msg: { type: 'string' },
                param: { type: 'string' },
                value: { type: 'string' }
              }
            }
          }
        }
      },
      HealthCheck: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['ok', 'degraded', 'down'],
            example: 'ok'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2026-02-01T12:00:00.000Z'
          },
          version: {
            type: 'string',
            example: '1.0.0'
          },
          services: {
            type: 'object',
            properties: {
              grafana: {
                type: 'string',
                enum: ['ok', 'error'],
                example: 'ok'
              },
              frappe: {
                type: 'string',
                enum: ['ok', 'error'],
                example: 'ok'
              }
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: 'Grafana',
      description: 'Grafana embed URL generation and dashboard proxying'
    },
    {
      name: 'Reports',
      description: 'Grafana reports management'
    },
    {
      name: 'Validation',
      description: 'Token validation endpoints (used by Nginx auth/proxy)'
    },
    {
      name: 'Health',
      description: 'Service health checks'
    },
    {
      name: 'Metrics',
      description: 'Prometheus metrics endpoint'
    }
  ]
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/index.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
