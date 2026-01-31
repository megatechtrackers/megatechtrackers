import { logger } from './logger.js';
import { UserContext } from '../types/index.js';
import { AuthorizationError } from './errors.js';

/**
 * Validate and enforce filters based on user context
 * Ensures users cannot access data outside their assigned scope
 */
export function validateFilters(
  filters: Record<string, string | string[]>,
  userContext: UserContext,
  frappeUser: string
): Record<string, string | string[]> {
  const validated: Record<string, string | string[]> = {};

  // Validate vehicle filter
  if (filters.vehicle) {
    const allowedVehicles = userContext.vehicles || [];
    const vehicleValue = Array.isArray(filters.vehicle) ? filters.vehicle[0] : filters.vehicle;
    
    if (allowedVehicles.length > 0 && !allowedVehicles.includes(vehicleValue)) {
      logger.warn('Unauthorized vehicle filter attempt', {
        frappeUser,
        requestedVehicle: vehicleValue,
        allowedVehicles
      });
      throw new AuthorizationError(`Vehicle ${vehicleValue} is not in user's allowed scope`);
    }
    validated.vehicle = vehicleValue;
  } else if (userContext.vehicles && userContext.vehicles.length === 1) {
    // Auto-apply single vehicle if user only has access to one
    validated.vehicle = userContext.vehicles[0];
  }

  // Validate company filter
  if (filters.company) {
    const allowedCompanies = userContext.companies || [];
    const companyValue = Array.isArray(filters.company) ? filters.company[0] : filters.company;
    
    if (allowedCompanies.length > 0 && !allowedCompanies.includes(companyValue)) {
      logger.warn('Unauthorized company filter attempt', {
        frappeUser,
        requestedCompany: companyValue,
        allowedCompanies
      });
      throw new AuthorizationError(`Company ${companyValue} is not in user's allowed scope`);
    }
    validated.company = companyValue;
  } else if (userContext.companies && userContext.companies.length === 1) {
    // Auto-apply single company if user only has access to one
    validated.company = userContext.companies[0];
  }

  // Validate department filter
  if (filters.department) {
    const allowedDepartments = userContext.departments || [];
    const departmentValue = Array.isArray(filters.department) 
      ? filters.department[0] 
      : filters.department;
    
    if (allowedDepartments.length > 0 && !allowedDepartments.includes(departmentValue)) {
      logger.warn('Unauthorized department filter attempt', {
        frappeUser,
        requestedDepartment: departmentValue,
        allowedDepartments
      });
      throw new AuthorizationError(`Department ${departmentValue} is not in user's allowed scope`);
    }
    validated.department = departmentValue;
  } else if (userContext.departments && userContext.departments.length === 1) {
    // Auto-apply single department if user only has access to one
    validated.department = userContext.departments[0];
  }

  // Add any additional filters that don't need validation
  Object.keys(filters).forEach(key => {
    if (!['vehicle', 'company', 'department'].includes(key)) {
      validated[key] = filters[key];
    }
  });

  return validated;
}
