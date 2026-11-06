import { ComponentFixture, TestBed } from '@angular/core/testing';
import '@angular/localize/init';

import { GfCorporateActionsTableComponent } from './corporate-actions-table.component';

describe('GfCorporateActionsTableComponent', () => {
  let component: GfCorporateActionsTableComponent;
  let fixture: ComponentFixture<GfCorporateActionsTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GfCorporateActionsTableComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GfCorporateActionsTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('entries', []);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
