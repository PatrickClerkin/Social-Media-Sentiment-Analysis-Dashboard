import numpy as np

# Part 1: Likely Isomorphic Graphs

def are_likely_isomorphic(graph1, graph2):
    """
    Determine if two graphs are likely to be isomorphic based on four criteria:
    a. Equal number of vertices
    b. Equal number of edges
    c. Same degree sequences
    d. Same sorted list of lists of degrees of adjacent vertices
    
    Parameters:
    graph1, graph2: numpy adjacency matrices (2D numpy arrays)
    
    Returns:
    dictionary with results of each criterion
    """
    results = {}
    
    # a. Equal number of vertices
    n1 = graph1.shape[0]
    n2 = graph2.shape[0]
    results['equal_vertices'] = (n1 == n2)
    
    # b. Equal number of edges
    edges1 = np.sum(graph1) / 2  # Divide by 2 since each edge is counted twice
    edges2 = np.sum(graph2) / 2
    results['equal_edges'] = (edges1 == edges2)
    
    # If different number of vertices, we can't compare the following criteria
    if not results['equal_vertices']:
        results['same_degree_sequence'] = False
        results['same_neighbor_degree_lists'] = False
        return results
    
    # c. Same degree sequences
    degrees1 = np.sum(graph1, axis=1)
    degrees2 = np.sum(graph2, axis=1)
    
    sorted_degrees1 = np.sort(degrees1)[::-1]  # Sort in descending order
    sorted_degrees2 = np.sort(degrees2)[::-1]
    
    results['same_degree_sequence'] = np.array_equal(sorted_degrees1, sorted_degrees2)
    
    # d. Same sorted lists of degrees of adjacent vertices
    neighbor_degrees1 = []
    neighbor_degrees2 = []
    
    for i in range(n1):
        # Get neighbors of vertex i
        neighbors1 = np.where(graph1[i] > 0)[0]
        # Get degrees of those neighbors
        neighbor_deg1 = degrees1[neighbors1]
        # Sort and add to list
        neighbor_degrees1.append(sorted(neighbor_deg1.tolist()))
        
        # Do the same for graph2
        neighbors2 = np.where(graph2[i] > 0)[0]
        neighbor_deg2 = degrees2[neighbors2]
        neighbor_degrees2.append(sorted(neighbor_deg2.tolist()))
    
    # Sort the lists of neighbor degrees lexicographically
    neighbor_degrees1.sort()
    neighbor_degrees2.sort()
    
    results['same_neighbor_degree_lists'] = (neighbor_degrees1 == neighbor_degrees2)
    
    # Overall result
    results['likely_isomorphic'] = all(results.values())
    
    return results

# Part 2: Bipartite Graphs

def is_bipartite(graph):
    """
    Determine if a graph is bipartite using BFS coloring.
    
    Parameters:
    graph: numpy adjacency matrix (2D numpy array)
    
    Returns:
    is_bipartite: boolean indicating if the graph is bipartite
    partition: list where each element is 0 or 1 indicating the partition
               (-1 if the vertex hasn't been assigned or if graph is not bipartite)
    """
    n = graph.shape[0]
    colors = np.full(n, -1)  # -1: uncolored, 0: set A, 1: set B
    
    # Function to check bipartiteness starting from a specific vertex
    def bfs_coloring(start):
        queue = [start]
        colors[start] = 0  # Assign first color
        
        while queue:
            current = queue.pop(0)
            current_color = colors[current]
            next_color = 1 - current_color  # Flip between 0 and 1
            
            # Find all neighbors
            neighbors = np.where(graph[current] > 0)[0]
            
            for neighbor in neighbors:
                if colors[neighbor] == -1:  # Uncolored
                    colors[neighbor] = next_color
                    queue.append(neighbor)
                elif colors[neighbor] == current_color:  # Same color conflict
                    return False
        
        return True
    
    # We need to run BFS from every unvisited vertex to handle disconnected graphs
    for i in range(n):
        if colors[i] == -1:  # If vertex hasn't been colored yet
            if not bfs_coloring(i):
                return False, colors
    
    return True, colors

def get_bipartition(graph):
    """
    If the graph is bipartite, return the two sets of vertices.
    
    Parameters:
    graph: numpy adjacency matrix
    
    Returns:
    is_bipartite: boolean indicating if the graph is bipartite
    partition_a: list of vertices in set A
    partition_b: list of vertices in set B
    """
    is_bip, colors = is_bipartite(graph)
    
    if not is_bip:
        return False, [], []
    
    partition_a = np.where(colors == 0)[0].tolist()
    partition_b = np.where(colors == 1)[0].tolist()
    
    return True, partition_a, partition_b

# TEST CASES

# Part 1: Test cases for Likely Isomorphic Graphs
def test_isomorphism():
    print("TESTING GRAPH ISOMORPHISM\n" + "="*50)
    
    # Pair 1: Same number of vertices and edges, different degree sequence
    # Graph 1: Path with 4 vertices
    g1_pair1 = np.array([
        [0, 1, 0, 0],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [0, 0, 1, 0]
    ])
    
    # Graph 2: Star with 4 vertices
    g2_pair1 = np.array([
        [0, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0]
    ])
    
    print("\nPair 1: Same vertices and edges, different degree sequence")
    print("Graph 1 (Path):")
    print(g1_pair1)
    print("Graph 2 (Star):")
    print(g2_pair1)
    
    results = are_likely_isomorphic(g1_pair1, g2_pair1)
    print("\nResults:")
    print(f"Equal vertices: {results['equal_vertices']}")
    print(f"Equal edges: {results['equal_edges']}")
    print(f"Same degree sequence: {results['same_degree_sequence']}")
    print(f"Same neighbor degree lists: {results['same_neighbor_degree_lists']}")
    print(f"Likely isomorphic: {results['likely_isomorphic']}")
    
    # Pair 2: Same vertices, edges, degree sequence, but not isomorphic
    # Graph 1: Path with 6 vertices
    g1_pair2 = np.array([
        [0, 1, 0, 0, 0, 0],
        [1, 0, 1, 0, 0, 0],
        [0, 1, 0, 1, 0, 0],
        [0, 0, 1, 0, 1, 0],
        [0, 0, 0, 1, 0, 1],
        [0, 0, 0, 0, 1, 0]
    ])
    
    # Graph 2: Star with branch
    g2_pair2 = np.array([
        [0, 1, 0, 0, 0, 0],
        [1, 0, 1, 1, 1, 0],
        [0, 1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 1],
        [0, 0, 0, 0, 1, 0]
    ])
    
    print("\n" + "="*50)
    print("\nPair 2: Same vertices, edges, degree sequence, not isomorphic")
    print("Graph 1 (Path):")
    print(g1_pair2)
    print("Graph 2 (Star with branch):")
    print(g2_pair2)
    
    results = are_likely_isomorphic(g1_pair2, g2_pair2)
    print("\nResults:")
    print(f"Equal vertices: {results['equal_vertices']}")
    print(f"Equal edges: {results['equal_edges']}")
    print(f"Same degree sequence: {results['same_degree_sequence']}")
    print(f"Same neighbor degree lists: {results['same_neighbor_degree_lists']}")
    print(f"Likely isomorphic: {results['likely_isomorphic']}")
    
    # Pair 3: Another pair that satisfies a, b, c but not isomorphic
    # Graph 1: Cycle with 6 vertices
    g1_pair3 = np.array([
        [0, 1, 0, 0, 0, 1],
        [1, 0, 1, 0, 0, 0],
        [0, 1, 0, 1, 0, 0],
        [0, 0, 1, 0, 1, 0],
        [0, 0, 0, 1, 0, 1],
        [1, 0, 0, 0, 1, 0]
    ])
    
    # Graph 2: Two triangles connected by an edge
    g2_pair3 = np.array([
        [0, 1, 1, 0, 0, 0],
        [1, 0, 1, 0, 0, 0],
        [1, 1, 0, 1, 0, 0],
        [0, 0, 1, 0, 1, 1],
        [0, 0, 0, 1, 0, 1],
        [0, 0, 0, 1, 1, 0]
    ])
    
    print("\n" + "="*50)
    print("\nPair 3: Same vertices, edges, degree sequence, not isomorphic")
    print("Graph 1 (Cycle):")
    print(g1_pair3)
    print("Graph 2 (Two triangles):")
    print(g2_pair3)
    
    results = are_likely_isomorphic(g1_pair3, g2_pair3)
    print("\nResults:")
    print(f"Equal vertices: {results['equal_vertices']}")
    print(f"Equal edges: {results['equal_edges']}")
    print(f"Same degree sequence: {results['same_degree_sequence']}")
    print(f"Same neighbor degree lists: {results['same_neighbor_degree_lists']}")
    print(f"Likely isomorphic: {results['likely_isomorphic']}")
    
    # Pair 4: Isomorphic graphs - cycle with 4 vertices, just relabeled
    g1_pair4 = np.array([
        [0, 1, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 0, 1, 0]
    ])
    
    g2_pair4 = np.array([
        [0, 1, 1, 0],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [0, 1, 1, 0]
    ])
    
    print("\n" + "="*50)
    print("\nPair 4: Isomorphic graphs - cycle with 4 vertices")
    print("Graph 1:")
    print(g1_pair4)
    print("Graph 2:")
    print(g2_pair4)
    
    results = are_likely_isomorphic(g1_pair4, g2_pair4)
    print("\nResults:")
    print(f"Equal vertices: {results['equal_vertices']}")
    print(f"Equal edges: {results['equal_edges']}")
    print(f"Same degree sequence: {results['same_degree_sequence']}")
    print(f"Same neighbor degree lists: {results['same_neighbor_degree_lists']}")
    print(f"Likely isomorphic: {results['likely_isomorphic']}")
    
    # Pair 5: Isomorphic graphs - two connected triangles, just relabeled
    g1_pair5 = np.array([
        [0, 1, 1, 0, 0, 0],
        [1, 0, 1, 1, 0, 0],
        [1, 1, 0, 0, 0, 0],
        [0, 1, 0, 0, 1, 1],
        [0, 0, 0, 1, 0, 1],
        [0, 0, 0, 1, 1, 0]
    ])
    
    g2_pair5 = np.array([
        [0, 1, 1, 0, 0, 0],
        [1, 0, 1, 0, 0, 0],
        [1, 1, 0, 1, 0, 0],
        [0, 0, 1, 0, 1, 1],
        [0, 0, 0, 1, 0, 1],
        [0, 0, 0, 1, 1, 0]
    ])
    
    print("\n" + "="*50)
    print("\nPair 5: Isomorphic graphs - two connected triangles")
    print("Graph 1:")
    print(g1_pair5)
    print("Graph 2:")
    print(g2_pair5)
    
    results = are_likely_isomorphic(g1_pair5, g2_pair5)
    print("\nResults:")
    print(f"Equal vertices: {results['equal_vertices']}")
    print(f"Equal edges: {results['equal_edges']}")
    print(f"Same degree sequence: {results['same_degree_sequence']}")
    print(f"Same neighbor degree lists: {results['same_neighbor_degree_lists']}")
    print(f"Likely isomorphic: {results['likely_isomorphic']}")

# Part 2: Test cases for Bipartite Graphs
def test_bipartite():
    print("\n\nTESTING BIPARTITE GRAPHS\n" + "="*50)
    
    # Graph 1: Bipartite - A cycle with 4 vertices (even cycle)
    g1 = np.array([
        [0, 1, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 0, 1, 0]
    ])
    
    print("\nGraph 1: Bipartite - Even cycle with 4 vertices")
    print(g1)
    is_bip, partition_a, partition_b = get_bipartition(g1)
    print(f"Is bipartite: {is_bip}")
    if is_bip:
        print(f"Partition A: {partition_a}")
        print(f"Partition B: {partition_b}")
        # Verify partitioning
        verify_bipartition(g1, partition_a, partition_b)
    
    # Graph 2: Not bipartite - A cycle with 5 vertices (odd cycle)
    g2 = np.array([
        [0, 1, 0, 0, 1],
        [1, 0, 1, 0, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 1, 0, 1],
        [1, 0, 0, 1, 0]
    ])
    
    print("\n" + "="*50)
    print("\nGraph 2: Not bipartite - Odd cycle with 5 vertices")
    print(g2)
    is_bip, partition_a, partition_b = get_bipartition(g2)
    print(f"Is bipartite: {is_bip}")
    if is_bip:
        print(f"Partition A: {partition_a}")
        print(f"Partition B: {partition_b}")
        verify_bipartition(g2, partition_a, partition_b)
    
    # Graph 3: Bipartite - Complete bipartite graph K2,3
    g3 = np.array([
        [0, 0, 1, 1, 1],
        [0, 0, 1, 1, 1],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0]
    ])
    
    print("\n" + "="*50)
    print("\nGraph 3: Bipartite - Complete bipartite K2,3")
    print(g3)
    is_bip, partition_a, partition_b = get_bipartition(g3)
    print(f"Is bipartite: {is_bip}")
    if is_bip:
        print(f"Partition A: {partition_a}")
        print(f"Partition B: {partition_b}")
        verify_bipartition(g3, partition_a, partition_b)
    
    # Graph 4: Not bipartite - Complete graph K4
    g4 = np.array([
        [0, 1, 1, 1],
        [1, 0, 1, 1],
        [1, 1, 0, 1],
        [1, 1, 1, 0]
    ])
    
    print("\n" + "="*50)
    print("\nGraph 4: Not bipartite - Complete graph K4")
    print(g4)
    is_bip, partition_a, partition_b = get_bipartition(g4)
    print(f"Is bipartite: {is_bip}")
    if is_bip:
        print(f"Partition A: {partition_a}")
        print(f"Partition B: {partition_b}")
        verify_bipartition(g4, partition_a, partition_b)
    
    # Graph 5: Bipartite - but traversal order dependent
    # This is a tree with specific structure
    g5 = np.array([
        [0, 1, 0, 0, 0, 0],
        [1, 0, 1, 1, 0, 0],
        [0, 1, 0, 0, 1, 0],
        [0, 1, 0, 0, 0, 1],
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0]
    ])
    
    print("\n" + "="*50)
    print("\nGraph 5: Bipartite tree - traversal order dependent")
    print(g5)
    is_bip, partition_a, partition_b = get_bipartition(g5)
    print(f"Is bipartite: {is_bip}")
    if is_bip:
        print(f"Partition A: {partition_a}")
        print(f"Partition B: {partition_b}")
        verify_bipartition(g5, partition_a, partition_b)
    
def verify_bipartition(graph, partition_a, partition_b):
    """Verify that a bipartition is valid"""
    valid = True
    # Check no edges within partition A
    for i in partition_a:
        for j in partition_a:
            if i != j and graph[i, j] > 0:
                valid = False
                print(f"Invalid partition! Edge within Partition A: {i}-{j}")
    
    # Check no edges within partition B
    for i in partition_b:
        for j in partition_b:
            if i != j and graph[i, j] > 0:
                valid = False
                print(f"Invalid partition! Edge within Partition B: {i}-{j}")
    
    if valid:
        print("Partitioning verified successfully!")
    else:
        print("Partitioning verification failed!")

# Execute both test suites
if __name__ == "__main__":
    print("\nRunning tests for both parts:\n")
    test_isomorphism()
    test_bipartite()