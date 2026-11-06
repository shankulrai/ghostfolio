import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PortfolioManagementService } from '@ghostfolio/api/services/portfolio-management/portfolio-management.service';

import { HttpException, HttpStatus } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { PortfolioManagementController } from './portfolio-management.controller';

describe('PortfolioManagementController', () => {
  let controller: PortfolioManagementController;
  let portfolioManagementService: any;
  let request: {
    user: { settings: { settings: { isBaseCurrencyConsentGiven?: boolean } } };
  };

  beforeEach(async () => {
    const portfolioManagementServiceMock = {
      getPortfoliosByUser: jest.fn(),
      createPortfolio: jest.fn(),
      updateBaseCurrency: jest.fn(),
      deletePortfolio: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfolioManagementController],
      providers: [
        {
          provide: PortfolioManagementService,
          useValue: portfolioManagementServiceMock
        },
        {
          provide: REQUEST,
          useValue: {
            user: {
              id: 'user-1',
              settings: { settings: { isBaseCurrencyConsentGiven: true } }
            }
          }
        },
        { provide: ConfigurationService, useValue: { get: jest.fn() } }
      ]
    }).compile();

    controller = module.get<PortfolioManagementController>(
      PortfolioManagementController
    );
    portfolioManagementService = module.get(PortfolioManagementService);
    request = module.get(REQUEST);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPortfolios', () => {
    it('should return user portfolios', async () => {
      const mockPortfolios = [
        {
          id: 'portfolio-1',
          userId: 'user-1',
          name: 'My Portfolio',
          baseCurrency: 'USD',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      portfolioManagementService.getPortfoliosByUser.mockResolvedValue(
        mockPortfolios
      );

      const result = await controller.getPortfolios();

      expect(result).toEqual(mockPortfolios);
      expect(
        portfolioManagementService.getPortfoliosByUser
      ).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createPortfolio', () => {
    it('should return 403 before creating a portfolio without base currency consent', async () => {
      request.user.settings.settings.isBaseCurrencyConsentGiven = false;

      await expect(
        controller.createPortfolio({
          name: 'My Portfolio',
          baseCurrency: 'USD'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          response: 'Consent required',
          status: HttpStatus.FORBIDDEN
        })
      );
      expect(portfolioManagementService.createPortfolio).not.toHaveBeenCalled();
    });

    it('should create portfolio for the authenticated user', async () => {
      const mockPortfolio = {
        id: 'portfolio-1',
        userId: 'user-1',
        name: 'My Portfolio',
        baseCurrency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      portfolioManagementService.createPortfolio.mockResolvedValue(
        mockPortfolio
      );

      const result = await controller.createPortfolio({
        name: 'My Portfolio',
        baseCurrency: 'USD'
      });

      expect(result).toEqual(mockPortfolio);
      expect(portfolioManagementService.createPortfolio).toHaveBeenCalledWith(
        'user-1',
        'My Portfolio',
        'USD'
      );
    });

    it('should return 400 for invalid currency', async () => {
      await expect(
        controller.createPortfolio({
          name: 'My Portfolio',
          baseCurrency: 'XYZ'
        })
      ).rejects.toThrow(HttpException);

      await expect(
        controller.createPortfolio({
          name: 'My Portfolio',
          baseCurrency: 'XYZ'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.stringContaining('Invalid base currency'),
          status: HttpStatus.BAD_REQUEST
        })
      );
    });

    it('should return 409 for duplicate portfolio name', async () => {
      portfolioManagementService.createPortfolio.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`userId`,`name`)')
      );

      await expect(
        controller.createPortfolio({
          name: 'My Portfolio',
          baseCurrency: 'USD'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.stringContaining('already exists'),
          status: HttpStatus.CONFLICT
        })
      );
    });
  });

  describe('updateBaseCurrency', () => {
    it('should update base currency successfully', async () => {
      const mockPortfolio = {
        id: 'portfolio-1',
        userId: 'user-1',
        name: 'My Portfolio',
        baseCurrency: 'EUR',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      portfolioManagementService.updateBaseCurrency.mockResolvedValue(
        mockPortfolio
      );

      const result = await controller.updateBaseCurrency('portfolio-1', {
        baseCurrency: 'EUR'
      });

      expect(result).toEqual(mockPortfolio);
      expect(
        portfolioManagementService.updateBaseCurrency
      ).toHaveBeenCalledWith('portfolio-1', 'user-1', 'EUR');
    });

    it('should return 400 for invalid currency', async () => {
      await expect(
        controller.updateBaseCurrency('portfolio-1', { baseCurrency: 'XYZ' })
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.stringContaining('Invalid base currency'),
          status: HttpStatus.BAD_REQUEST
        })
      );
    });

    it('should return 403 when portfolio is not owned by the user', async () => {
      portfolioManagementService.updateBaseCurrency.mockResolvedValue(null);

      await expect(
        controller.updateBaseCurrency('portfolio-1', { baseCurrency: 'EUR' })
      ).rejects.toThrow(
        expect.objectContaining({
          response: 'Forbidden',
          status: HttpStatus.FORBIDDEN
        })
      );
    });
  });

  describe('deletePortfolio', () => {
    it('should delete portfolio owned by the user', async () => {
      portfolioManagementService.deletePortfolio.mockResolvedValue(true);

      await controller.deletePortfolio('portfolio-1');

      expect(portfolioManagementService.deletePortfolio).toHaveBeenCalledWith(
        'portfolio-1',
        'user-1'
      );
    });

    it('should return 403 when portfolio is not owned by the user', async () => {
      portfolioManagementService.deletePortfolio.mockResolvedValue(false);

      await expect(controller.deletePortfolio('portfolio-1')).rejects.toThrow(
        expect.objectContaining({
          response: 'Forbidden',
          status: HttpStatus.FORBIDDEN
        })
      );
    });
  });
});
