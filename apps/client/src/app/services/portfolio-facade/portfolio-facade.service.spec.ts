import {
  HttpClientTestingModule,
  HttpTestingController
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Portfolio, PortfolioFacadeService } from './portfolio-facade.service';

describe('PortfolioFacadeService', () => {
  let service: PortfolioFacadeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PortfolioFacadeService]
    });
    service = TestBed.inject(PortfolioFacadeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPortfolios', () => {
    it('should fetch portfolios from API', () => {
      const mockPortfolios: Portfolio[] = [
        {
          id: 'portfolio-1',
          userId: 'user-1',
          name: 'Default',
          baseCurrency: 'USD',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01')
        },
        {
          id: 'portfolio-2',
          userId: 'user-1',
          name: 'Trading',
          baseCurrency: 'EUR',
          createdAt: new Date('2024-02-01'),
          updatedAt: new Date('2024-02-01')
        }
      ];

      service.getPortfolios().subscribe((portfolios) => {
        expect(portfolios).toEqual(mockPortfolios);
        expect(portfolios.length).toBe(2);
      });

      const req = httpMock.expectOne('/api/v1/portfolio-management');
      expect(req.request.method).toBe('GET');
      req.flush(mockPortfolios);
    });

    it('should handle 404 error', () => {
      service.getPortfolios().subscribe({
        next: () => fail('should have failed with 404 error'),
        error: (error) => {
          expect(error).toBeTruthy();
        }
      });

      const req = httpMock.expectOne('/api/v1/portfolio-management');
      req.flush('Not found', { status: 404, statusText: 'Not Found' });
    });
  });

  describe('getCurrentPortfolio', () => {
    it('should return the first portfolio', () => {
      const mockPortfolios: Portfolio[] = [
        {
          id: 'portfolio-1',
          userId: 'user-1',
          name: 'Default',
          baseCurrency: 'USD',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01')
        }
      ];

      service.getCurrentPortfolio().subscribe((portfolio) => {
        expect(portfolio).toEqual(mockPortfolios[0]);
        expect(portfolio.id).toBe('portfolio-1');
      });

      const req = httpMock.expectOne('/api/v1/portfolio-management');
      req.flush(mockPortfolios);
    });

    it('should handle empty portfolio list', () => {
      service.getCurrentPortfolio().subscribe({
        next: () => fail('should have failed with no portfolio error'),
        error: (error) => {
          expect(error.message).toBe('No portfolio found');
        }
      });

      const req = httpMock.expectOne('/api/v1/portfolio-management');
      req.flush([]);
    });
  });

  describe('updateBaseCurrency', () => {
    it('should update base currency successfully', () => {
      const mockPortfolio: Portfolio = {
        id: 'portfolio-1',
        userId: 'user-1',
        name: 'Default',
        baseCurrency: 'EUR',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-03-01')
      };

      service
        .updateBaseCurrency('portfolio-1', 'EUR')
        .subscribe((portfolio) => {
          expect(portfolio).toEqual(mockPortfolio);
          expect(portfolio.baseCurrency).toBe('EUR');
        });

      const req = httpMock.expectOne(
        '/api/v1/portfolio-management/portfolio-1/base-currency'
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ baseCurrency: 'EUR' });
      req.flush(mockPortfolio);
    });

    it('should handle 403 unauthorized error', () => {
      service.updateBaseCurrency('portfolio-1', 'EUR').subscribe({
        next: () => fail('should have failed with 403 error'),
        error: (error) => {
          expect(error).toBeTruthy();
        }
      });

      const req = httpMock.expectOne(
        '/api/v1/portfolio-management/portfolio-1/base-currency'
      );
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    });

    it('should handle 400 invalid currency error', () => {
      service.updateBaseCurrency('portfolio-1', 'INVALID').subscribe({
        next: () => fail('should have failed with 400 error'),
        error: (error) => {
          expect(error).toBeTruthy();
        }
      });

      const req = httpMock.expectOne(
        '/api/v1/portfolio-management/portfolio-1/base-currency'
      );
      req.flush('Invalid base currency', {
        status: 400,
        statusText: 'Bad Request'
      });
    });
  });
});
