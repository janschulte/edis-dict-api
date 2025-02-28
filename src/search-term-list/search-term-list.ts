import { Injectable } from '@nestjs/common';
import * as xlsx from 'xlsx';

interface ListEntry {
  Suchwortkategorie?: string;
  Suchworte?: string;
  Übersetzungen?: string;
  Synonyme?: string;
}

@Injectable()
export class SearchTermListService {
  private searchTermList: ListEntry[];

  constructor() {
    const res = xlsx.readFile('Suchwortliste-Dict-API_v0-1_2022-06-23.xlsx');
    const sheet = res.Sheets['Tabelle1'];
    this.searchTermList = xlsx.utils.sheet_to_json(sheet);
  }

  getAlternativeGewaesser(gewaesser: string): string[] | undefined {
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Gewässer / Flüsse') {
        return (
          e.Suchworte?.toLocaleLowerCase().indexOf(
            gewaesser.toLocaleLowerCase(),
          ) >= 0
        );
      }
    });
    return this.handleMatch(match);
  }

  getAlternativeEinzugsgebiete(einzugsgebiet?: string): string[] | undefined {
    if (!einzugsgebiet) return;
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Einzugsgebiete') {
        return (
          e.Suchworte?.toLocaleLowerCase().indexOf(
            einzugsgebiet.toLocaleLowerCase(),
          ) >= 0
        );
      }
    });
    return this.handleMatch(match);
  }

  getAlternativeKreise(kreis?: string): string[] | undefined {
    if (!kreis) return;
    kreis = kreis
      .replaceAll('Landkreis', '')
      .replaceAll('landkreis', '')
      .replaceAll('Kreis', '')
      .replaceAll('kreis', '')
      .trim();
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Landkreis') {
        return (
          e.Suchworte?.toLocaleLowerCase().indexOf(kreis.toLocaleLowerCase()) >=
          0
        );
      }
    });
    return this.handleMatch(match);
  }

  private handleMatch(match: ListEntry) {
    if (match) {
      const syn = this.getSynonyme(match);
      const trans = this.getTranslations(match);
      return syn.length || trans.length ? [...syn, ...trans] : undefined;
    }
  }

  private getTranslations(e: ListEntry) {
    const term = e.Übersetzungen;
    if (term) {
      return term.split(',').map((e) => e.trim());
    } else {
      return [];
    }
  }

  private getSynonyme(e: ListEntry): string[] {
    const term = e.Synonyme;
    if (term) {
      return term.split(',').map((e) => e.trim());
    } else {
      return [];
    }
  }
}
