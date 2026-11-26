import { Evaluator, FitnessConfig } from "../core/heuristics.js";
import { ALL_ACTIONS } from "../core/puzzle.js";
import { SeededRNG } from "../core/rng.js";
import { SearchMetrics, SearchResult, Solver, nowMs } from "../core/solver_base.js";

export class GAConfig {
  constructor({
    populationSize = 50,
    sequenceLength = 36,
    numGenerations = 120,
    mutationRate = 0.15,
    crossoverRate = 0.85,
    crossoverType = "single_point",
    mutationType = "point",
    selectionMethod = "tournament",
    tournamentK = 4,
    elitismCount = 2,
    avoidInverse = true,
    repairSequences = true,
    seed = 42,
    fitnessConfig = null,
  } = {}) {
    this.populationSize = Number(populationSize);
    this.sequenceLength = Number(sequenceLength);
    this.numGenerations = Number(numGenerations);
    this.mutationRate = Number(mutationRate);
    this.crossoverRate = Number(crossoverRate);
    this.crossoverType = crossoverType;
    this.mutationType = mutationType;
    this.selectionMethod = selectionMethod;
    this.tournamentK = Number(tournamentK);
    this.elitismCount = Number(elitismCount);
    this.avoidInverse = Boolean(avoidInverse);
    this.repairSequences = Boolean(repairSequences);
    this.seed = Number(seed);
    this.fitnessConfig = fitnessConfig || new FitnessConfig();
  }
}

export class GeneticAlgorithmSolver extends Solver {
  constructor(environment, config = null) {
    super(environment);
    this.name = "Genetic Algorithm";
    this.category = "evolutionary";
    this.config = config || new GAConfig();
    this.evaluator = new Evaluator(environment, this.config.fitnessConfig);
    this.rng = new SeededRNG(this.config.seed);
  }

  generatePopulation(initialState) {
    const pop = [];
    for (let i = 0; i < this.config.populationSize; i++) {
      pop.push(
        this.env.generateRandomSequence(
          this.config.sequenceLength,
          this.rng,
          initialState,
          this.config.avoidInverse,
          true
        )
      );
    }
    return pop;
  }

  fitness(initialState, sequence) {
    return this.evaluator.fitness(initialState, sequence);
  }

  _roulettePickIndex(fitnessScores) {
    const minScore = Math.min(...fitnessScores);
    const shift = minScore <= 0 ? 1.0 - minScore : 0.0;
    const weights = fitnessScores.map((s) => s + shift);
    const total = weights.reduce((acc, w) => acc + w, 0);
    if (total <= 0) return this.rng.randRange(fitnessScores.length);

    const threshold = this.rng.random() * total;
    let cumulative = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (cumulative >= threshold) return i;
    }
    return weights.length - 1;
  }

  _tournamentPickIndex(fitnessScores) {
    const k = Math.min(Math.max(1, this.config.tournamentK), fitnessScores.length);
    const indices = Array.from({ length: fitnessScores.length }, (_, i) => i);
    const candidates = this.rng.sample(indices, k);
    let bestIdx = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (fitnessScores[candidates[i]] > fitnessScores[bestIdx]) {
        bestIdx = candidates[i];
      }
    }
    return bestIdx;
  }

  select(initialState, population, evaluated = null) {
    const results = evaluated || population.map((seq) => this.fitness(initialState, seq));
    const scores = results.map((r) => r.fitness);
    const numPairs = Math.max(1, Math.floor(population.length / 2));
    const method = this.config.selectionMethod.toLowerCase();

    const pairs = [];
    for (let p = 0; p < numPairs; p++) {
      let i1;
      let i2;
      if (method === "roulette") {
        i1 = this._roulettePickIndex(scores);
        i2 = this._roulettePickIndex(scores);
      } else if (method === "tournament") {
        i1 = this._tournamentPickIndex(scores);
        i2 = this._tournamentPickIndex(scores);
      } else {
        throw new Error(`Unknown selection method: ${this.config.selectionMethod}`);
      }
      pairs.push([population[i1].slice(), population[i2].slice()]);
    }
    return pairs;
  }

  crossover(parentA, parentB, initialState = null) {
    const length = Math.min(parentA.length, parentB.length);
    if (length < 2 || this.rng.random() > this.config.crossoverRate) {
      return [parentA.slice(), parentB.slice()];
    }

    let childA;
    let childB;
    const ctype = this.config.crossoverType.toLowerCase();
    if (ctype === "single_point") {
      const pt = this.rng.randInt(1, length - 1);
      childA = parentA.slice(0, pt).concat(parentB.slice(pt));
      childB = parentB.slice(0, pt).concat(parentA.slice(pt));
    } else if (ctype === "two_point") {
      let p1 = 1;
      let p2 = 1;
      if (length > 2) {
        const cuts = Array.from({ length: length - 1 }, (_, i) => i + 1);
        const sampled = this.rng.sample(cuts, 2).sort((a, b) => a - b);
        [p1, p2] = sampled;
      }
      childA = parentA.slice(0, p1).concat(parentB.slice(p1, p2), parentA.slice(p2));
      childB = parentB.slice(0, p1).concat(parentA.slice(p1, p2), parentB.slice(p2));
    } else {
      throw new Error(`Unknown crossover type: ${this.config.crossoverType}`);
    }

    if (this.config.repairSequences && initialState !== null) {
      childA = this.env.repairSequence(initialState, childA, this.rng);
      childB = this.env.repairSequence(initialState, childB, this.rng);
    }
    return [childA, childB];
  }

  mutate(sequence, initialState = null) {
    let seq = sequence.slice();
    if (seq.length === 0 || this.rng.random() > this.config.mutationRate) {
      return seq;
    }

    const mtype = this.config.mutationType.toLowerCase();
    const n = seq.length;
    if (mtype === "point") {
      const idx = this.rng.randRange(n);
      const alternatives = ALL_ACTIONS.filter((a) => a !== seq[idx]);
      seq[idx] = this.rng.choice(alternatives);
    } else if (mtype === "swap") {
      if (n >= 2) {
        const indices = Array.from({ length: n }, (_, i) => i);
        const [i, j] = this.rng.sample(indices, 2);
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
    } else if (mtype === "segment") {
      const segLen = Math.min(n, Math.max(2, Math.floor(n / 6)));
      const start = this.rng.randInt(0, n - segLen);
      for (let offset = 0; offset < segLen; offset++) {
        seq[start + offset] = this.rng.choice(ALL_ACTIONS);
      }
    } else {
      throw new Error(`Unknown mutation type: ${this.config.mutationType}`);
    }

    if (this.config.repairSequences && initialState !== null) {
      seq = this.env.repairSequence(initialState, seq, this.rng);
    }
    return seq;
  }

  solve(initialState) {
    const heuristicName = this.config.fitnessConfig.heuristicName;
    if (!this.env.isSolvable(initialState)) {
      return this.unsolvableResult(initialState, heuristicName);
    }
    const start = nowMs();
    this.rng = new SeededRNG(this.config.seed);

    if (this.env.goalTest(initialState)) {
      return new SearchResult({
        algorithm: this.name,
        category: this.category,
        status: "solved",
        solved: true,
        initialState,
        finalState: initialState,
        actions: [],
        pathCost: 0,
        heuristicName,
        metrics: new SearchMetrics({
          nodesGenerated: 1,
          maxFrontierSize: this.config.populationSize,
          elapsedMs: 0,
        }),
      });
    }

    let population = this.generatePopulation(initialState);
    let totalEvaluations = 0;
    const history = [];
    let bestSequence = population[0].slice();
    let bestResult = null;
    let goalReachedGeneration = null;

    for (let gen = 0; gen < this.config.numGenerations; gen++) {
      const evaluated = population.map((seq) => this.fitness(initialState, seq));
      totalEvaluations += evaluated.length;

      let bestIdx = 0;
      for (let i = 1; i < evaluated.length; i++) {
        if (evaluated[i].fitness > evaluated[bestIdx].fitness) {
          bestIdx = i;
        }
      }
      const genBest = evaluated[bestIdx];
      if (bestResult === null || genBest.fitness > bestResult.fitness) {
        bestResult = genBest;
        bestSequence = population[bestIdx].slice();
      }

      const solvedInGen = evaluated.filter((r) => r.evaluation.conflictCount === 0);
      if (solvedInGen.length > 0 && goalReachedGeneration === null) {
        goalReachedGeneration = gen;
      }

      const meanFit = evaluated.reduce((s, r) => s + r.fitness, 0) / evaluated.length;
      const minConflicts = Math.min(...evaluated.map((r) => r.evaluation.conflictCount));
      const minDistance = Math.min(...evaluated.map((r) => r.evaluation.distance));
      const bestSolvedCost =
        solvedInGen.length > 0
          ? Math.min(...solvedInGen.map((r) => r.evaluation.pathCost))
          : genBest.evaluation.pathCost;

      history.push({
        generation: gen,
        best_fitness: Number(genBest.fitness.toFixed(3)),
        mean_fitness: Number(meanFit.toFixed(3)),
        min_conflicts: minConflicts,
        min_distance: minDistance,
        best_path_cost: bestSolvedCost,
        solved_count: solvedInGen.length,
        goal_reached: solvedInGen.length > 0,
      });

      const ranked = Array.from({ length: population.length }, (_, i) => i).sort(
        (a, b) => evaluated[b].fitness - evaluated[a].fitness
      );
      const eliteN = Math.min(this.config.elitismCount, population.length);
      const nextPop = ranked.slice(0, eliteN).map((idx) => population[idx].slice());

      const parentPairs = this.select(initialState, population, evaluated);
      let pairIdx = 0;
      while (nextPop.length < this.config.populationSize) {
        const [pA, pB] = parentPairs[pairIdx % parentPairs.length];
        pairIdx++;
        let [cA, cB] = this.crossover(pA, pB, initialState);
        cA = this.mutate(cA, initialState);
        cB = this.mutate(cB, initialState);
        nextPop.push(cA);
        if (nextPop.length < this.config.populationSize) {
          nextPop.push(cB);
        }
      }
      population = nextPop;
    }

    const finalEval = this.evaluator.evaluateSequence(initialState, bestSequence, true);
    return new SearchResult({
      algorithm: this.name,
      category: this.category,
      status: finalEval.solved ? "solved" : "limit_reached",
      solved: finalEval.solved,
      initialState,
      finalState: finalEval.finalState,
      actions: finalEval.executedActions.slice(),
      pathCost: finalEval.pathCost,
      heuristicName,
      metrics: new SearchMetrics({
        nodesExpanded: totalEvaluations,
        nodesGenerated: totalEvaluations,
        maxFrontierSize: this.config.populationSize,
        elapsedMs: nowMs() - start,
        extra: {
          best_fitness: Number(bestResult.fitness.toFixed(3)),
          final_conflict_count: finalEval.conflictCount,
          final_distance: finalEval.distance,
          goal_reached_generation: goalReachedGeneration,
          selection_method: this.config.selectionMethod,
          crossover_type: this.config.crossoverType,
          mutation_type: this.config.mutationType,
          generations: this.config.numGenerations,
        },
      }),
      history,
    });
  }
}
