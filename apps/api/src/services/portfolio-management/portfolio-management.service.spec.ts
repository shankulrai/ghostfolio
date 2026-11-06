import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Test, TestingModule } from '@nestjs/testing';

import { PortfolioManagementService } from './portfolio-management.service';

describe('PortfolioManagementService', () => {
  let service: PortfolioManagementService;
  let prismaService: any;

  beforeEach(async () => {
    const prismaServiceMock = {
      portfolio: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn()
      }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioManagementService,
        { provide: PrismaService, useValue: prismaServiceMock }
      ]
    }).compile();

    service = module.get<PortfolioManagementService>(
      PortfolioManagementService
    );
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPortfolio', () => {
    it('should create portfolio with valid data', async () => {
      const mockPortfolio = {
        id: 'portfolio-1',
        userId: 'user-1',
        name: 'My Portfolio',
        baseCurrency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prismaService.portfolio.create.mockResolvedValue(mockPortfolio as any);

      const result = await service.createPortfolio(
        'user-1',
        'My Portfolio',
        'USD'
      );

      expect(result).toEqual(mockPortfolio);
      expect(prismaService.portfolio.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'My Portfolio',
          baseCurrency: 'USD'
        }
      });
    });

    it('should enforce unique (userId, name) constraint', async () => {
      prismaService.portfolio.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`userId`,`name`)')
      );

      await expect(
        service.createPortfolio('user-1', 'My Portfolio', 'USD')
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('getPortfoliosByUser', () => {
    it('should return all portfolios for a user', async () => {
      const mockPortfolios = [
        {
          id: 'portfolio-1',
          userId: 'user-1',
          name: 'Portfolio A',
          baseCurrency: 'USD',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date()
        },
        {
          id: 'portfolio-2',
          userId: 'user-1',
          name: 'Portfolio B',
          baseCurrency: 'EUR',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date()
        }
      ];

      prismaService.portfolio.findMany.mockResolvedValue(mockPortfolios as any);

      const result = await service.getPortfoliosByUser('user-1');

      expect(result).toEqual(mockPortfolios);
      expect(prismaService.portfolio.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' }
      });
    });
  });

  describe('getDefaultPortfolio', () => {
    it('should return first created portfolio for user', async () => {
      const mockPortfolio = {
        id: 'portfolio-1',
        userId: 'user-1',
        name: 'Default Portfolio',
        baseCurrency: 'USD',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date()
      };

      prismaService.portfolio.findMany.mockResolvedValue([
        mockPortfolio
      ] as any);

      const result = await service.getDefaultPortfolio('user-1');

      expect(result).toEqual(mockPortfolio);
      expect(prismaService.portfolio.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
        take: 1
      });
    });

    it('should return null when user has no portfolios', async () => {
      prismaService.portfolio.findMany.mockResolvedValue([]);

      const result = await service.getDefaultPortfolio('user-1');

      expect(result).toBeNull();
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

      prismaService.portfolio.findFirst.mockResolvedValue(mockPortfolio as any);
      prismaService.portfolio.update.mockResolvedValue(mockPortfolio as any);

      const result = await service.updateBaseCurrency(
        'portfolio-1',
        'user-1',
        'EUR'
      );

      expect(result).toEqual(mockPortfolio);
      expect(prismaService.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: 'portfolio-1', userId: 'user-1' }
      });
      expect(prismaService.portfolio.update).toHaveBeenCalledWith({
        where: { id: 'portfolio-1' },
        data: { baseCurrency: 'EUR' }
      });
    });

    it('should return null and not update when portfolio belongs to another user', async () => {
      prismaService.portfolio.findFirst.mockResolvedValue(null);

      const result = await service.updateBaseCurrency(
        'portfolio-1',
        'user-2',
        'EUR'
      );

      expect(result).toBeNull();
      expect(prismaService.portfolio.update).not.toHaveBeenCalled();
    });
  });

  describe('deletePortfolio', () => {
    it('should delete only portfolios owned by the user', async () => {
      prismaService.portfolio.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deletePortfolio('portfolio-1', 'user-1');

      expect(result).toBe(true);
      expect(prismaService.portfolio.deleteMany).toHaveBeenCalledWith({
        where: { id: 'portfolio-1', userId: 'user-1' }
      });
    });

    it('should return false when portfolio belongs to another user', async () => {
      prismaService.portfolio.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deletePortfolio('portfolio-1', 'user-2');

      expect(result).toBe(false);
    });
  });
});
