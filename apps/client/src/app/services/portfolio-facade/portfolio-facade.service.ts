import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  baseCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({ providedIn: 'root' })
export class PortfolioFacadeService {
  private readonly http = inject(HttpClient);

  public getPortfolios(): Observable<Portfolio[]> {
    return this.http
      .get<Portfolio[]>('/api/v1/portfolio-management')
      .pipe(catchError(this.handleError));
  }

  public getCurrentPortfolio(): Observable<Portfolio> {
    return this.getPortfolios().pipe(
      map((portfolios) => {
        // Return the first portfolio (default)
        if (portfolios.length === 0) {
          throw new Error('No portfolio found');
        }
        return portfolios[0];
      }),
      catchError(this.handleError)
    );
  }

  public createPortfolio(
    name: string,
    baseCurrency: string
  ): Observable<Portfolio> {
    return this.http
      .post<Portfolio>('/api/v1/portfolio-management', { baseCurrency, name })
      .pipe(catchError(this.handleError));
  }

  public updateBaseCurrency(
    portfolioId: string,
    baseCurrency: string
  ): Observable<Portfolio> {
    return this.http
      .put<Portfolio>(
        `/api/v1/portfolio-management/${portfolioId}/base-currency`,
        { baseCurrency }
      )
      .pipe(catchError(this.handleError));
  }

  private handleError(error: any): Observable<never> {
    if (error.error instanceof Error) {
      const errMessage = error.error.message;
      return throwError(() => errMessage);
    }

    return throwError(() => error ?? 'Server error');
  }
}
